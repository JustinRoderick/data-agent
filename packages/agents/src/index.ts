import { Agent, run, tool } from "@openai/agents";
import type { DatabricksQueryResult } from "@openai-demo/databricks";
import type { RetrievedContext } from "@openai-demo/rag";
import { z } from "zod";

import { assessDatabricksSchema, retrieveMetricContext } from "./context";
import { validateInSandbox } from "./sandbox";
import {
  type AgentStepName,
  type AnalysisPlan,
  type CloudCostCopilotDependencies,
  type CloudCostCopilotResult,
  type CopilotQuestion,
  type CopilotRunEvent,
  type CopilotRunPlan,
  type NarrativeAnswer,
  type SandboxValidationResult,
  type SchemaAssessment,
  type SqlDraft,
  type SqlSafetyResult,
  analysisPlanSchema,
  cloudCostCopilotResultSchema,
  narrativeAnswerSchema,
  retrievedContextSchema,
  sandboxValidationResultSchema,
  schemaAssessmentSchema,
  sqlDraftSchema,
  sqlSafetyResultSchema,
} from "./schemas";
import {
  buildDeterministicSqlDraft,
  extractSql,
  normalizeSingleSqlStatement,
  validateSqlDraft,
} from "./sql";

export * from "./schemas";

export function createInitialRunPlan(input: CopilotQuestion): CopilotRunPlan {
  const steps: AgentStepName[] = [
    "coordinator",
    "metric_catalog",
    "schema_lookup",
    "sql_analyst",
    "sql_safety",
    "sandbox_validation",
    "databricks_execution",
    "narrative",
  ];

  return {
    question: input.question,
    runMode: input.runMode,
    steps: steps.map((name) => ({
      name,
      status: name === "coordinator" ? "running" : "pending",
      summary: describeAgentStep(name),
    })),
  };
}

export function describeAgentStep(name: AgentStepName): string {
  const descriptions: Record<AgentStepName, string> = {
    coordinator: "Route the BI question through the specialist agent workflow.",
    metric_catalog: "Retrieve governed metric definitions and business context.",
    schema_lookup: "Find relevant Databricks tables, columns, and join paths.",
    sql_analyst: "Draft Databricks SQL from the metric and schema context.",
    sql_safety: "Check the generated SQL for read-only and scope constraints.",
    sandbox_validation: "Validate query shape against local mock data before live execution.",
    databricks_execution: "Run approved SQL against Databricks when live mode is enabled.",
    narrative: "Summarize results with citations, assumptions, and caveats.",
  };

  return descriptions[name];
}

export async function runCloudCostCopilot(
  input: CopilotQuestion,
  dependencies: CloudCostCopilotDependencies,
): Promise<CloudCostCopilotResult> {
  const plan = createInitialRunPlan(input);
  const tableName = dependencies.tableName ?? "gcp_billing_usage";

  await emit(dependencies, {
    type: "step",
    step: "coordinator",
    status: "running",
    message: "Started cloud cost copilot run.",
  });
  const analysisPlan = dependencies.useModel
    ? await buildModelBackedAnalysisPlan(input, dependencies)
    : buildDeterministicAnalysisPlan(input);
  await emit(dependencies, {
    type: "step",
    step: "coordinator",
    status: "completed",
    message: `Classified question as ${analysisPlan.questionType}.`,
    data: analysisPlan,
  });

  await emit(dependencies, {
    type: "step",
    step: "metric_catalog",
    status: "running",
    message: "Retrieving metric and table context.",
  });
  const retrievedContext = await retrieveMetricContext(input.question, dependencies.rag);
  const citations = retrievedContext.citations;
  await emit(dependencies, {
    type: "step",
    step: "metric_catalog",
    status: "completed",
    message: `Retrieved ${citations.length} context documents.`,
    data: retrievedContext,
  });

  await emit(dependencies, {
    type: "step",
    step: "schema_lookup",
    status: "running",
    message: "Inspecting Databricks table schema.",
  });
  const schemaAssessment = await assessDatabricksSchema(
    tableName,
    input.question,
    dependencies.databricks,
  );
  await emit(dependencies, {
    type: "step",
    step: "schema_lookup",
    status: "completed",
    message: `Found ${schemaAssessment.columns.length} columns on ${tableName}.`,
    data: schemaAssessment,
  });

  await emit(dependencies, {
    type: "step",
    step: "sql_analyst",
    status: "running",
    message: dependencies.useModel
      ? "Generating SQL with OpenAI Agents SDK."
      : "Generating SQL with deterministic planner.",
  });
  let sqlDraft = dependencies.useModel
    ? await buildModelBackedCloudCostSql(
        input.question,
        tableName,
        citations,
        schemaAssessment,
        dependencies,
      )
    : buildDeterministicSqlDraft(input.question, tableName);

  await emit(dependencies, {
    type: "sql",
    step: "sql_analyst",
    status: "completed",
    message: "Generated Databricks SQL.",
    data: sqlDraft,
  });

  await emit(dependencies, {
    type: "step",
    step: "sql_safety",
    status: "running",
    message: "Checking generated SQL safety.",
  });
  let sqlSafety = validateSqlDraft(sqlDraft.sql, tableName, schemaAssessment);
  if (!sqlSafety.passed) {
    if (dependencies.useModel) {
      await emit(dependencies, {
        type: "step",
        step: "sql_safety",
        status: "running",
        message: `Model SQL failed safety checks; falling back to deterministic SQL. ${sqlSafety.reasons.join(" ")}`,
        data: sqlSafety,
      });
      sqlDraft = buildDeterministicSqlDraft(input.question, tableName);
      await emit(dependencies, {
        type: "sql",
        step: "sql_analyst",
        status: "completed",
        message: "Recovered with deterministic Databricks SQL.",
        data: sqlDraft,
      });
      sqlSafety = validateSqlDraft(sqlDraft.sql, tableName, schemaAssessment);
    }

    if (!sqlSafety.passed) {
      await emit(dependencies, {
        type: "error",
        step: "sql_safety",
        status: "failed",
        message: sqlSafety.reasons.join(" "),
        data: sqlSafety,
      });
      throw new Error(`Generated SQL failed safety checks: ${sqlSafety.reasons.join(" ")}`);
    }
  }
  await emit(dependencies, {
    type: "step",
    step: "sql_safety",
    status: "completed",
    message: "SQL passed read-only safety checks.",
    data: sqlSafety,
  });

  await emit(dependencies, {
    type: "step",
    step: "sandbox_validation",
    status: "running",
    message: "Validating SQL against sandbox data.",
  });
  const sandboxValidation = await validateInSandbox(sqlDraft.sql, input, dependencies);
  if (!sandboxValidation.passed) {
    await emit(dependencies, {
      type: "error",
      step: "sandbox_validation",
      status: "failed",
      message: sandboxValidation.warnings.join(" "),
      data: sandboxValidation,
    });
    throw new Error(`Sandbox validation failed: ${sandboxValidation.warnings.join(" ")}`);
  }
  await emit(dependencies, {
    type: "result",
    step: "sandbox_validation",
    status: "completed",
    message: `Sandbox returned ${sandboxValidation.rowCount} preview rows.`,
    data: sandboxValidation,
  });

  await emit(dependencies, {
    type: "step",
    step: "databricks_execution",
    status: "running",
    message: "Executing approved SQL in Databricks.",
  });
  const queryResult = await dependencies.databricks.runReadOnlyQuery(sqlDraft.sql);
  await emit(dependencies, {
    type: "result",
    step: "databricks_execution",
    status: "completed",
    message: `Databricks returned ${queryResult.rowCount} rows.`,
    data: queryResult,
  });

  await emit(dependencies, {
    type: "step",
    step: "narrative",
    status: "running",
    message: "Creating final FinOps answer.",
  });
  const narrative = dependencies.useModel
    ? await buildModelBackedNarrative(
        input.question,
        sqlDraft.sql,
        queryResult,
        citations,
        sqlSafety,
        sandboxValidation,
        dependencies,
      )
    : buildDeterministicNarrative(input.question, queryResult, citations, schemaAssessment);
  await emit(dependencies, {
    type: "step",
    step: "narrative",
    status: "completed",
    message: "Final answer created.",
    data: narrative,
  });

  return cloudCostCopilotResultSchema.parse({
    question: input.question,
    answer: narrative.answer,
    sql: sqlDraft.sql,
    citations: citations.map((citation) => ({
      title: citation.title,
      sourcePath: citation.sourcePath,
      excerpt: citation.excerpt,
    })),
    rows: queryResult.rows,
    steps: plan.steps.map((step) => ({
      ...step,
      status: "completed",
    })),
  });
}

export function createCloudCostAgentDefinitions(dependencies: CloudCostCopilotDependencies) {
  const tools = createCloudCostTools(dependencies);
  const metricCatalogAgent = createMetricCatalogAgent(tools);
  const schemaAgent = createSchemaAgent(tools);
  const sqlAnalystAgent = createSqlAnalystAgent();
  const sqlSafetyAgent = createSqlSafetyAgent();
  const sandboxAgent = createSandboxAgent(tools);
  const databricksExecutorAgent = createDatabricksExecutorAgent(tools);
  const narrativeAgent = createNarrativeAgent();
  const coordinatorAgent = createCoordinatorAgent([
    metricCatalogAgent,
    schemaAgent,
    sqlAnalystAgent,
    sqlSafetyAgent,
    sandboxAgent,
    databricksExecutorAgent,
    narrativeAgent,
  ]);

  return {
    coordinatorAgent,
    metricCatalogAgent,
    schemaAgent,
    sqlAnalystAgent,
    sqlSafetyAgent,
    sandboxAgent,
    databricksExecutorAgent,
    narrativeAgent,
    tools,
  };
}

export function createCloudCostTools(dependencies: CloudCostCopilotDependencies) {
  const searchMetricContext = tool({
    name: "search_metric_context",
    description: "Search cloud cost metric definitions, table documentation, and FinOps runbooks.",
    parameters: z.object({
      query: z.string(),
      limit: z.number().int().positive().max(10).default(5),
    }),
    execute: ({ query, limit }) => dependencies.rag.search(query, { limit }),
  });

  const listDatabricksColumns = tool({
    name: "list_databricks_columns",
    description: "List columns for the approved Databricks billing table.",
    parameters: z.object({
      tableName: z.string(),
    }),
    execute: ({ tableName }) => dependencies.databricks.listColumns(tableName),
  });

  const previewDatabricksTable = tool({
    name: "preview_databricks_table",
    description: "Preview rows from the approved Databricks billing table.",
    parameters: z.object({
      tableName: z.string(),
      limit: z.number().int().positive().max(25).default(5),
    }),
    execute: ({ tableName, limit }) => dependencies.databricks.getTablePreview(tableName, limit),
  });

  const runReadOnlyDatabricksSql = tool({
    name: "run_read_only_databricks_sql",
    description: "Run approved read-only Databricks SQL against the GCP billing usage table.",
    parameters: z.object({
      sql: z.string(),
    }),
    execute: ({ sql }) => dependencies.databricks.runReadOnlyQuery(sql),
  });

  return {
    searchMetricContext,
    listDatabricksColumns,
    previewDatabricksTable,
    runReadOnlyDatabricksSql,
  };
}

type CloudCostTools = ReturnType<typeof createCloudCostTools>;

export function createCoordinatorAgent(handoffs: Agent<any, any>[]) {
  return new Agent({
    name: "Cloud Cost Coordinator Agent",
    instructions:
      "Classify the cloud cost question, coordinate specialists, and keep the answer grounded in Databricks data and retrieved metric context.",
    handoffDescription: "Routes the cloud cost workflow across specialist agents.",
    handoffs,
    handoffOutputTypeWarningEnabled: false,
    outputType: analysisPlanSchema,
  });
}

export function createMetricCatalogAgent(tools: Pick<CloudCostTools, "searchMetricContext">) {
  return new Agent({
    name: "Metric Catalog Agent",
    handoffDescription: "Retrieves cloud cost metric and table context.",
    instructions:
      "Retrieve only grounded cloud cost context from the knowledge base. Return concise context with citations.",
    tools: [tools.searchMetricContext],
    outputType: retrievedContextSchema,
  });
}

export function createSchemaAgent(
  tools: Pick<CloudCostTools, "listDatabricksColumns" | "previewDatabricksTable">,
) {
  return new Agent({
    name: "Databricks Schema Agent",
    handoffDescription: "Inspects Databricks billing table metadata.",
    instructions:
      "Use Databricks metadata tools to identify available fields, cost/date columns, and unsupported requested dimensions.",
    tools: [tools.listDatabricksColumns, tools.previewDatabricksTable],
    outputType: schemaAssessmentSchema,
  });
}

export function createSqlAnalystAgent() {
  return new Agent({
    name: "Databricks SQL Analyst Agent",
    handoffDescription: "Creates safe Databricks SQL for cloud cost questions.",
    instructions:
      "Generate exactly one read-only Databricks SQL query. Use rounded_cost_usd for spend and usage_start_ts for date filters. Do not execute SQL.",
    outputType: sqlDraftSchema,
  });
}

export function createSqlSafetyAgent() {
  return new Agent({
    name: "SQL Safety Agent",
    handoffDescription: "Reviews SQL for read-only and table-scope constraints.",
    instructions:
      "Check SQL for read-only SELECT/WITH usage, approved table references, date predicates, and broad scan risks.",
    outputType: sqlSafetyResultSchema,
  });
}

export function createSandboxAgent(
  tools: Pick<CloudCostTools, "previewDatabricksTable" | "runReadOnlyDatabricksSql">,
) {
  return new Agent({
    name: "Sandbox Validation Agent",
    handoffDescription: "Validates SQL shape against sandbox billing data before live execution.",
    instructions:
      "Validate that the SQL returns expected rows and columns on sandbox data before live Databricks execution.",
    tools: [tools.previewDatabricksTable, tools.runReadOnlyDatabricksSql],
    outputType: sandboxValidationResultSchema,
  });
}

export function createDatabricksExecutorAgent(
  tools: Pick<CloudCostTools, "runReadOnlyDatabricksSql">,
) {
  return new Agent({
    name: "Databricks Executor Agent",
    handoffDescription: "Executes already-approved SQL against Databricks.",
    instructions:
      "Run only SQL that has already passed safety and sandbox validation. Return query metadata and rows.",
    tools: [tools.runReadOnlyDatabricksSql],
  });
}

export function createNarrativeAgent() {
  return new Agent({
    name: "Cloud Cost Narrative Agent",
    handoffDescription: "Writes the final cited BI answer.",
    instructions:
      "Explain Databricks query results in concise FinOps language. Mention metric definition, caveats, citations, and useful follow-up slices.",
    outputType: narrativeAnswerSchema,
  });
}

function buildDeterministicAnalysisPlan(input: CopilotQuestion): AnalysisPlan {
  const normalized = input.question.toLowerCase();
  const requestedDimensions: string[] = [];

  if (normalized.includes("region")) {
    requestedDimensions.push("region_zone");
  } else {
    requestedDimensions.push("service_name");
  }

  return analysisPlanSchema.parse({
    questionType:
      normalized.includes("cpu") || normalized.includes("utilization")
        ? "utilization_analysis"
        : "spend_breakdown",
    normalizedQuestion: input.question,
    requestedDimensions,
    rationale:
      "Deterministic classifier selected the closest supported cloud billing question type.",
  });
}

async function buildModelBackedAnalysisPlan(
  input: CopilotQuestion,
  dependencies: CloudCostCopilotDependencies,
): Promise<AnalysisPlan> {
  const agent = createCoordinatorAgent([]);
  const prompt = [
    "Create a concise structured analysis plan for this cloud billing question.",
    "Supported dimensions include service_name, region_zone, CPU utilization, and memory utilization.",
    "Default to August 2024 when the user does not specify a time window.",
    `Run mode: ${input.runMode}`,
    `Question: ${input.question}`,
  ].join("\n\n");
  const result = await runModel(agent, prompt, dependencies, { maxTurns: 2 });

  return analysisPlanSchema.parse(result ?? buildDeterministicAnalysisPlan(input));
}

async function buildModelBackedCloudCostSql(
  question: string,
  tableName: string,
  citations: RetrievedContext[],
  schemaAssessment: SchemaAssessment,
  dependencies: CloudCostCopilotDependencies,
): Promise<SqlDraft> {
  const sqlGeneratorAgent = createSqlAnalystAgent();
  const context = citations
    .map((citation) => `# ${citation.title}\n${citation.excerpt}`)
    .join("\n\n");
  const prompt = [
    "Create one Databricks SQL SELECT query for the user question.",
    "Return a structured SQL draft object with exactly one SQL query.",
    "The SQL must start with SELECT or WITH, must not include markdown, must not include commentary, and must not end with a semicolon.",
    `Table: ${tableName}`,
    "Default date window: August 2024 unless the user asks for another period.",
    "Use rounded_cost_usd for cloud spend.",
    `Available columns: ${schemaAssessment.columns.map((column) => column.columnName).join(", ")}`,
    `Retrieved context:\n${context}`,
    `Question: ${question}`,
  ].join("\n\n");
  const result = await runModel(sqlGeneratorAgent, prompt, dependencies, { maxTurns: 3 });
  const output =
    typeof result === "string"
      ? result
      : sqlDraftSchema.safeParse(result).success
        ? sqlDraftSchema.parse(result).sql
        : "";
  const sql = normalizeSingleSqlStatement(extractSql(output));

  return sqlDraftSchema.parse({
    ...buildDeterministicSqlDraft(question, tableName),
    sql: sql || buildDeterministicSqlDraft(question, tableName).sql,
  });
}

async function buildModelBackedNarrative(
  question: string,
  sql: string,
  queryResult: DatabricksQueryResult,
  citations: RetrievedContext[],
  sqlSafety: SqlSafetyResult,
  sandboxValidation: SandboxValidationResult,
  dependencies: CloudCostCopilotDependencies,
): Promise<NarrativeAnswer> {
  const agent = createNarrativeAgent();
  const prompt = [
    "Write a concise BI/FinOps answer from these Databricks results.",
    "Mention the cloud_spend_usd definition when relevant and cite caveats from retrieved docs.",
    `Question: ${question}`,
    `SQL: ${sql}`,
    `Rows: ${JSON.stringify(queryResult.rows.slice(0, 10))}`,
    `Citations: ${JSON.stringify(citations)}`,
    `SQL safety: ${JSON.stringify(sqlSafety)}`,
    `Sandbox: ${JSON.stringify(sandboxValidation)}`,
  ].join("\n\n");
  const result = await runModel(agent, prompt, dependencies, { maxTurns: 2 });

  return narrativeAnswerSchema.parse(
    result ??
      buildDeterministicNarrative(question, queryResult, citations, {
        tableName: "gcp_billing_usage",
        columns: [],
        dateColumn: "usage_start_ts",
        costColumn: "rounded_cost_usd",
        supportedDimensions: [],
        unsupportedFields: [],
        warnings: [],
      }),
  );
}

async function runModel(
  agent: Agent<any, any>,
  prompt: string,
  dependencies: CloudCostCopilotDependencies,
  options: { maxTurns: number },
): Promise<unknown> {
  if (dependencies.modelRunner) {
    return dependencies.modelRunner(agent, prompt);
  }

  const result = await run(agent, prompt, {
    maxTurns: options.maxTurns,
    ...(dependencies.model ? { model: dependencies.model } : {}),
  });

  return result.finalOutput;
}

function buildDeterministicNarrative(
  question: string,
  queryResult: DatabricksQueryResult,
  citations: RetrievedContext[],
  schemaAssessment: SchemaAssessment,
): NarrativeAnswer {
  const topRow = queryResult.rows[0];
  const citationText =
    citations.length > 0 ? ` Grounded by ${citations.length} retrieved knowledge docs.` : "";
  const caveats = [
    ...schemaAssessment.unsupportedFields.map((field) => `Dataset does not include ${field}.`),
    ...schemaAssessment.warnings,
  ];

  if (!topRow) {
    return narrativeAnswerSchema.parse({
      answer: `No Databricks rows were returned for: ${question}.${citationText}`,
      caveats,
      followUpQuestions: ["Try a supported August 2024 spend breakdown by service or region."],
    });
  }

  return narrativeAnswerSchema.parse({
    answer: `The query returned ${queryResult.rowCount} rows for: ${question}. The top result is ${JSON.stringify(
      topRow,
    )}.${citationText}`,
    caveats,
    followUpQuestions: [
      "Break the same spend down by region.",
      "Compare spend with average CPU and memory utilization.",
    ],
  });
}

async function emit(
  dependencies: Pick<CloudCostCopilotDependencies, "onEvent">,
  event: CopilotRunEvent,
): Promise<void> {
  await dependencies.onEvent?.(event);
}
