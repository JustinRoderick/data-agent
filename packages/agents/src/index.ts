import { Agent, tool } from "@openai/agents";
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
  rag: RagConnector;
  tableName?: string;
}

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
  const citations = await dependencies.rag.search(input.question, { limit: 4 });
  const sql = buildCloudCostSql(input.question, tableName);

  assertReadOnlySql(sql);

  const queryResult = await dependencies.databricks.runReadOnlyQuery(sql);

  return cloudCostCopilotResultSchema.parse({
    question: input.question,
    answer: summarizeCloudCostResult(input.question, queryResult, citations),
    sql,
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
  const searchMetricContext = tool({
    name: "search_metric_context",
    description: "Search cloud cost metric definitions, table documentation, and FinOps runbooks.",
    parameters: z.object({
      query: z.string(),
      limit: z.number().int().positive().max(10).default(5),
    }),
    execute: ({ query, limit }) => dependencies.rag.search(query, { limit }),
  });

  const runReadOnlyDatabricksSql = tool({
    name: "run_read_only_databricks_sql",
    description: "Run approved read-only Databricks SQL against the GCP billing usage table.",
    parameters: z.object({
      sql: z.string(),
    }),
    execute: ({ sql }) => dependencies.databricks.runReadOnlyQuery(sql),
  });

  const metricCatalogAgent = new Agent({
    name: "Metric Catalog Agent",
    handoffDescription: "Retrieves cloud cost metric and table context.",
    instructions:
      "Retrieve only grounded cloud cost context from the knowledge base. Return concise context with citations.",
    tools: [searchMetricContext],
  });

  const sqlAnalystAgent = new Agent({
    name: "Databricks SQL Analyst Agent",
    handoffDescription: "Creates safe Databricks SQL for cloud cost questions.",
    instructions:
      "Generate read-only Databricks SQL for the bi_demo.gcp_billing_usage table. Prefer rounded_cost_usd for cloud spend.",
    tools: [runReadOnlyDatabricksSql],
  });

  const coordinatorAgent = new Agent({
    name: "Cloud Cost Coordinator Agent",
    instructions:
      "Coordinate cloud cost analysis. Use metric context, inspect or run safe Databricks SQL, and produce a concise FinOps answer.",
    handoffs: [metricCatalogAgent, sqlAnalystAgent],
  });

  return {
    coordinatorAgent,
    metricCatalogAgent,
    sqlAnalystAgent,
    tools: {
      searchMetricContext,
      runReadOnlyDatabricksSql,
    },
  };
}

function buildCloudCostSql(question: string, tableName: string): string {
  const normalized = question.toLowerCase();
  const datePredicate =
    "usage_start_ts >= TIMESTAMP '2024-08-01' AND usage_start_ts < TIMESTAMP '2024-09-01'";

  if (normalized.includes("region")) {
    return `
      SELECT
        region_zone,
        SUM(rounded_cost_usd) AS cloud_spend_usd
      FROM ${tableName}
      WHERE ${datePredicate}
      GROUP BY region_zone
      ORDER BY cloud_spend_usd DESC
      LIMIT 10
    `;
  }

  if (normalized.includes("cpu") || normalized.includes("utilization")) {
    return `
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
    `;
  }

  return `
    SELECT
      service_name,
      SUM(rounded_cost_usd) AS cloud_spend_usd
    FROM ${tableName}
    WHERE ${datePredicate}
    GROUP BY service_name
    ORDER BY cloud_spend_usd DESC
    LIMIT 10
  `;
}

function summarizeCloudCostResult(
  question: string,
  queryResult: DatabricksQueryResult,
  citations: RetrievedContext[],
): string {
  const topRow = queryResult.rows[0];
  const citationText =
    citations.length > 0 ? ` Grounded by ${citations.length} retrieved knowledge docs.` : "";

  if (!topRow) {
    return `No Databricks rows were returned for: ${question}.${citationText}`;
  }

  return `The query returned ${queryResult.rowCount} rows for: ${question}. The top result is ${JSON.stringify(
    topRow,
  )}.${citationText}`;
}
