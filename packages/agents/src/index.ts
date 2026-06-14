import { Agent, run, tool } from "@openai/agents";
import type { DatabricksConnector, DatabricksQueryResult } from "@openai-demo/databricks";
import { assertReadOnlySql } from "@openai-demo/databricks";
import type { RagConnector, RetrievedContext } from "@openai-demo/rag";
import { z } from "zod";

export const copilotQuestionSchema = z.object({
  question: z.string().trim().min(1),
  runMode: z.enum(["mock", "live"]).default("mock"),
});

export type CopilotQuestion = z.infer<typeof copilotQuestionSchema>;

export type AgentStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type AgentStepName =
  | "coordinator"
  | "metric_catalog"
  | "schema_lookup"
  | "sql_analyst"
  | "sql_safety"
  | "sandbox_validation"
  | "databricks_execution"
  | "narrative";

export interface AgentStep {
  name: AgentStepName;
  status: AgentStepStatus;
  summary: string;
}

export interface CopilotRunEvent {
  type: "step" | "sql" | "result" | "error";
  step?: AgentStepName;
  status?: AgentStepStatus;
  message: string;
  data?: unknown;
}

export interface CopilotRunPlan {
  question: string;
  runMode: CopilotQuestion["runMode"];
  steps: AgentStep[];
}

export const cloudCostCopilotResultSchema = z.object({
  question: z.string(),
  answer: z.string(),
  sql: z.string(),
  citations: z.array(
    z.object({
      title: z.string(),
      sourcePath: z.string().optional(),
      excerpt: z.string(),
    }),
  ),
  rows: z.array(z.record(z.string(), z.unknown())),
  steps: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      summary: z.string(),
    }),
  ),
});

export type CloudCostCopilotResult = z.infer<typeof cloudCostCopilotResultSchema>;

export interface CloudCostCopilotDependencies {
  databricks: DatabricksConnector;
  sandboxDatabricks?: DatabricksConnector;
  rag: RagConnector;
  tableName?: string;
  useModel?: boolean;
  model?: string;
  onEvent?: (event: CopilotRunEvent) => void | Promise<void>;
}

export const analysisPlanSchema = z.object({
  questionType: z.enum([
    "spend_breakdown",
    "trend_comparison",
    "utilization_analysis",
    "anomaly_root_cause",
    "metadata_lookup",
    "unsupported",
  ]),
  normalizedQuestion: z.string().min(1),
  metricId: z.string().default("cloud_spend_usd"),
  timeWindow: z.string().default("August 2024"),
  requestedDimensions: z.array(z.string()).default([]),
  needsClarification: z.boolean().default(false),
  rationale: z.string().default(""),
});

export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;

export const retrievedContextSchema = z.object({
  citations: z.array(
    z.object({
      documentId: z.string(),
      title: z.string(),
      excerpt: z.string(),
      score: z.number(),
      sourcePath: z.string().optional(),
    }),
  ),
  metricIds: z.array(z.string()).default(["cloud_spend_usd"]),
  caveats: z.array(z.string()).default([]),
});

export type RetrievedContextResult = z.infer<typeof retrievedContextSchema>;

export const schemaAssessmentSchema = z.object({
  tableName: z.string().min(1),
  columns: z.array(
    z.object({
      columnName: z.string(),
      dataType: z.string(),
      comment: z.string().optional(),
    }),
  ),
  dateColumn: z.string().default("usage_start_ts"),
  costColumn: z.string().default("rounded_cost_usd"),
  supportedDimensions: z.array(z.string()).default([]),
  unsupportedFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export type SchemaAssessment = z.infer<typeof schemaAssessmentSchema>;

export const sqlDraftSchema = z.object({
  sql: z.string().min(1),
  metricId: z.string().default("cloud_spend_usd"),
  dimensions: z.array(z.string()).default([]),
  timeWindow: z.string().default("August 2024"),
  assumptions: z.array(z.string()).default([]),
});

export type SqlDraft = z.infer<typeof sqlDraftSchema>;

export const sqlSafetyResultSchema = z.object({
  passed: z.boolean(),
  reasons: z.array(z.string()).default([]),
  approvedTables: z.array(z.string()).default([]),
  correctedSql: z.string().optional(),
});

export type SqlSafetyResult = z.infer<typeof sqlSafetyResultSchema>;

export const sandboxValidationResultSchema = z.object({
  passed: z.boolean(),
  rowCount: z.number().int().nonnegative(),
  previewRows: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.string()).default([]),
});

export type SandboxValidationResult = z.infer<typeof sandboxValidationResultSchema>;

export const narrativeAnswerSchema = z.object({
  answer: z.string().min(1),
  caveats: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
});

export type NarrativeAnswer = z.infer<typeof narrativeAnswerSchema>;

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
  const schemaAssessment = await assessDatabricksSchema(tableName, input.question, dependencies);
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
  const sqlDraft = dependencies.useModel
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
  const sqlSafety = validateSqlDraft(sqlDraft.sql, tableName, schemaAssessment);
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

function buildDeterministicSqlDraft(question: string, tableName: string): SqlDraft {
  const normalized = question.toLowerCase();
  const datePredicate =
    "usage_start_ts >= TIMESTAMP '2024-08-01' AND usage_start_ts < TIMESTAMP '2024-09-01'";

  if (normalized.includes("region")) {
    return sqlDraftSchema.parse({
      sql: `
      SELECT
        region_zone,
        SUM(rounded_cost_usd) AS cloud_spend_usd
      FROM ${tableName}
      WHERE ${datePredicate}
      GROUP BY region_zone
      ORDER BY cloud_spend_usd DESC
      LIMIT 10
    `,
      dimensions: ["region_zone"],
      assumptions: ["Defaulted to August 2024 because no other date window was requested."],
    });
  }

  if (normalized.includes("cpu") || normalized.includes("utilization")) {
    return sqlDraftSchema.parse({
      sql: `
      SELECT
        service_name,
        SUM(rounded_cost_usd) AS cloud_spend_usd,
        AVG(cpu_utilization_pct) AS avg_cpu_utilization_pct,
        AVG(memory_utilization_pct) AS avg_memory_utilization_pct
      FROM ${tableName}
      WHERE ${datePredicate}
      GROUP BY service_name
      ORDER BY cloud_spend_usd DESC
      LIMIT 10
    `,
      dimensions: ["service_name"],
      assumptions: ["Defaulted to August 2024 because no other date window was requested."],
    });
  }

  return sqlDraftSchema.parse({
    sql: `
    SELECT
      service_name,
      SUM(rounded_cost_usd) AS cloud_spend_usd
    FROM ${tableName}
    WHERE ${datePredicate}
    GROUP BY service_name
    ORDER BY cloud_spend_usd DESC
    LIMIT 10
  `,
    dimensions: ["service_name"],
    assumptions: ["Defaulted to August 2024 because no other date window was requested."],
  });
}

async function buildModelBackedAnalysisPlan(
  input: CopilotQuestion,
  dependencies: CloudCostCopilotDependencies,
): Promise<AnalysisPlan> {
  const agent = createCoordinatorAgent([]);
  const result = await run(
    agent,
    [
      "Create a concise structured analysis plan for this cloud billing question.",
      "Supported dimensions include service_name, region_zone, CPU utilization, and memory utilization.",
      "Default to August 2024 when the user does not specify a time window.",
      `Run mode: ${input.runMode}`,
      `Question: ${input.question}`,
    ].join("\n\n"),
    {
      maxTurns: 2,
      ...(dependencies.model ? { model: dependencies.model } : {}),
    },
  );

  return analysisPlanSchema.parse(result.finalOutput ?? buildDeterministicAnalysisPlan(input));
}

async function retrieveMetricContext(
  question: string,
  rag: RagConnector,
): Promise<RetrievedContextResult> {
  const citations = await rag.search(question, { limit: 4 });

  return retrievedContextSchema.parse({
    citations,
    caveats: inferKnowledgeCaveats(citations),
  });
}

function inferKnowledgeCaveats(citations: RetrievedContext[]): string[] {
  const caveats = new Set<string>();
  const content = citations.map((citation) => citation.excerpt.toLowerCase()).join("\n");

  for (const field of ["project id", "sku", "labels", "credits", "discounts", "amortized cost"]) {
    if (content.includes(field)) {
      caveats.add(`Retrieved docs mention ${field}; verify whether this demo dataset includes it.`);
    }
  }

  return [...caveats];
}

async function assessDatabricksSchema(
  tableName: string,
  question: string,
  dependencies: Pick<CloudCostCopilotDependencies, "databricks">,
): Promise<SchemaAssessment> {
  const columns = await listColumnsWithFallback(tableName, dependencies.databricks);
  const columnNames = new Set(columns.map((column) => column.columnName));
  const unsupportedFields = [];
  const warnings = [];

  for (const field of ["project_id", "sku_id", "labels", "credits", "discounts"]) {
    if (question.toLowerCase().includes(field.replace("_", " ")) && !columnNames.has(field)) {
      unsupportedFields.push(field);
    }
  }

  if (!columnNames.has("rounded_cost_usd")) {
    warnings.push("Expected rounded_cost_usd is missing; spend SQL may need a different metric.");
  }

  return schemaAssessmentSchema.parse({
    tableName,
    columns: columns.map((column) => ({
      columnName: column.columnName,
      dataType: column.dataType,
      comment: column.comment,
    })),
    supportedDimensions: ["service_name", "region_zone"].filter((column) =>
      columnNames.has(column),
    ),
    unsupportedFields,
    warnings,
  });
}

async function listColumnsWithFallback(tableName: string, databricks: DatabricksConnector) {
  const columns = await databricks.listColumns(tableName);

  if (columns.length > 0 || !tableName.includes(".")) {
    return columns;
  }

  return databricks.listColumns(unqualifiedTableName(tableName));
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
  const result = await run(
    sqlGeneratorAgent,
    [
      "Create one Databricks SQL SELECT query for the user question.",
      "Return a structured SQL draft object.",
      `Table: ${tableName}`,
      "Default date window: August 2024 unless the user asks for another period.",
      "Use rounded_cost_usd for cloud spend.",
      `Available columns: ${schemaAssessment.columns.map((column) => column.columnName).join(", ")}`,
      `Retrieved context:\n${context}`,
      `Question: ${question}`,
    ].join("\n\n"),
    {
      maxTurns: 3,
      ...(dependencies.model ? { model: dependencies.model } : {}),
    },
  );
  const output =
    typeof result.finalOutput === "string"
      ? result.finalOutput
      : sqlDraftSchema.safeParse(result.finalOutput).success
        ? sqlDraftSchema.parse(result.finalOutput).sql
        : "";
  const sql = extractSql(output);

  return sqlDraftSchema.parse({
    ...buildDeterministicSqlDraft(question, tableName),
    sql: sql || buildDeterministicSqlDraft(question, tableName).sql,
  });
}

function extractSql(output: string): string {
  return output
    .replace(/^```sql\s*/iu, "")
    .replace(/^```\s*/u, "")
    .replace(/```$/u, "")
    .trim();
}

function validateSqlDraft(
  sql: string,
  tableName: string,
  schemaAssessment: SchemaAssessment,
): SqlSafetyResult {
  const reasons = [];

  try {
    assertReadOnlySql(sql);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "SQL failed read-only validation.");
  }

  if (!referencesApprovedTable(sql, tableName)) {
    reasons.push(`SQL must reference only the approved table: ${tableName}.`);
  }

  if (!/\busage_start_ts\b/iu.test(sql)) {
    reasons.push("SQL must include a usage_start_ts date predicate.");
  }

  if (
    schemaAssessment.supportedDimensions.length > 0 &&
    !schemaAssessment.columns.some((column) => sql.includes(column.columnName))
  ) {
    reasons.push("SQL does not reference any known billing table columns.");
  }

  return sqlSafetyResultSchema.parse({
    passed: reasons.length === 0,
    reasons,
    approvedTables: [tableName],
  });
}

function referencesApprovedTable(sql: string, tableName: string): boolean {
  const approved = new Set([normalizeTableReference(tableName), unqualifiedTableName(tableName)]);
  const referencedTables = [...sql.matchAll(/\b(?:from|join)\s+([`"A-Za-z0-9_.]+)/giu)].map(
    (match) => normalizeTableReference(match[1] ?? ""),
  );

  return referencedTables.length > 0 && referencedTables.every((table) => approved.has(table));
}

function normalizeTableReference(tableName: string): string {
  return tableName.replaceAll(/[`"]/gu, "").trim().toLowerCase();
}

function unqualifiedTableName(tableName: string): string {
  return normalizeTableReference(tableName).split(".").at(-1) ?? tableName;
}

async function validateInSandbox(
  sql: string,
  input: CopilotQuestion,
  dependencies: CloudCostCopilotDependencies,
): Promise<SandboxValidationResult> {
  const sandbox =
    dependencies.sandboxDatabricks ??
    (input.runMode === "mock" ? dependencies.databricks : undefined);

  if (!sandbox) {
    return sandboxValidationResultSchema.parse({
      passed: true,
      rowCount: 0,
      previewRows: [],
      warnings: [
        "No sandbox connector configured; deterministic SQL safety was used as the sandbox gate.",
      ],
    });
  }

  const result = await sandbox.runReadOnlyQuery(sql);
  const warnings = result.rowCount === 0 ? ["Sandbox query returned no rows."] : [];

  return sandboxValidationResultSchema.parse({
    passed: warnings.length === 0,
    rowCount: result.rowCount,
    previewRows: result.rows.slice(0, 5),
    warnings,
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
  const result = await run(
    agent,
    [
      "Write a concise BI/FinOps answer from these Databricks results.",
      "Mention the cloud_spend_usd definition when relevant and cite caveats from retrieved docs.",
      `Question: ${question}`,
      `SQL: ${sql}`,
      `Rows: ${JSON.stringify(queryResult.rows.slice(0, 10))}`,
      `Citations: ${JSON.stringify(citations)}`,
      `SQL safety: ${JSON.stringify(sqlSafety)}`,
      `Sandbox: ${JSON.stringify(sandboxValidation)}`,
    ].join("\n\n"),
    {
      maxTurns: 2,
      ...(dependencies.model ? { model: dependencies.model } : {}),
    },
  );

  return narrativeAnswerSchema.parse(
    result.finalOutput ??
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
