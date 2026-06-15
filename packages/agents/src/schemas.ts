import type { DatabricksConnector } from "@openai-demo/databricks";
import type { RagConnector } from "@openai-demo/rag";
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
