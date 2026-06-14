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
