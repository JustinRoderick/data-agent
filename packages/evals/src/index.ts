import { z } from "zod";

export const evalScenarioSchema = z.object({
  id: z.string().min(1),
  input: z.object({
    question: z.string().min(1),
  }),
  expected: z.object({
    metricId: z.string().min(1),
    requiredTables: z.array(z.string()).default([]),
    shouldUseSandbox: z.boolean().default(true),
    shouldExecuteDatabricks: z.boolean().default(false),
  }),
});

export type EvalScenario = z.infer<typeof evalScenarioSchema>;

export interface EvalOutput {
  metricId?: string;
  sql?: string;
  usedTables: string[];
  usedSandbox: boolean;
  executedDatabricks: boolean;
  finalAnswer: string;
}

export interface EvalScore {
  name: string;
  score: number;
  reason: string;
}

export function scoreScenario(scenario: EvalScenario, output: EvalOutput): EvalScore[] {
  return [
    scoreMetric(scenario.expected.metricId, output.metricId),
    scoreRequiredTables(scenario.expected.requiredTables, output.usedTables),
    scoreBoolean("sandbox_used", scenario.expected.shouldUseSandbox, output.usedSandbox),
    scoreBoolean(
      "databricks_execution",
      scenario.expected.shouldExecuteDatabricks,
      output.executedDatabricks,
    ),
  ];
}

function scoreMetric(expectedMetricId: string, actualMetricId: string | undefined): EvalScore {
  const passed = expectedMetricId === actualMetricId;

  return {
    name: "metric_selection",
    score: passed ? 1 : 0,
    reason: passed
      ? `Selected expected metric ${expectedMetricId}.`
      : `Expected metric ${expectedMetricId}, got ${actualMetricId ?? "none"}.`,
  };
}

function scoreRequiredTables(requiredTables: string[], usedTables: string[]): EvalScore {
  const missing = requiredTables.filter((table) => !usedTables.includes(table));

  return {
    name: "required_tables",
    score: missing.length === 0 ? 1 : 0,
    reason:
      missing.length === 0
        ? "All required tables were used."
        : `Missing required tables: ${missing.join(", ")}.`,
  };
}

function scoreBoolean(name: string, expected: boolean, actual: boolean): EvalScore {
  const passed = expected === actual;

  return {
    name,
    score: passed ? 1 : 0,
    reason: passed ? `Expected ${name}=${expected}.` : `Expected ${expected}, got ${actual}.`,
  };
}
