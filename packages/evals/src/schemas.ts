import { z } from "zod";

export const evalScenarioSchema = z.object({
  id: z.string().min(1),
  input: z.object({
    question: z.string().min(1),
    runMode: z.enum(["mock", "live"]).default("mock"),
  }),
  expected: z.object({
    metricId: z.string().min(1).default("cloud_spend_usd"),
    requiredTables: z.array(z.string()).default(["gcp_billing_usage"]),
    requiredSqlFragments: z.array(z.string()).default([]),
    forbiddenSqlFragments: z
      .array(z.string())
      .default([
        "ALTER ",
        "CREATE ",
        "DELETE ",
        "DROP ",
        "INSERT ",
        "MERGE ",
        "TRUNCATE ",
        "UPDATE ",
      ]),
    shouldUseSandbox: z.boolean().default(true),
    shouldExecuteLiveDatabricks: z.boolean().default(false),
    shouldHaveCitations: z.boolean().default(true),
    minimumRows: z.number().int().nonnegative().default(1),
    expectedAnswerTerms: z.array(z.string().min(1)).default([]),
    minimumAnswerTermMatches: z.number().int().nonnegative().default(0),
  }),
});

export type EvalScenario = z.infer<typeof evalScenarioSchema>;
export type EvalInput = EvalScenario["input"];
export type EvalExpected = EvalScenario["expected"];

export interface EvalOutput {
  question: string;
  answer: string;
  sql: string;
  citations: Array<{
    title: string;
    sourcePath?: string;
    excerpt: string;
  }>;
  rows: Record<string, unknown>[];
  events: Array<{
    type: string;
    step?: string;
    status?: string;
    message: string;
    data?: unknown;
  }>;
  metricId?: string;
  usedTables: string[];
  usedSandbox: boolean;
  executedLiveDatabricks: boolean;
}

export type EvalMetadata = Record<string, unknown> & {
  scenarioId: string;
  category: string;
};

export interface LocalEvalCase {
  input: EvalInput;
  expected: EvalExpected;
  metadata: EvalMetadata;
}

export interface EvalScore {
  name: string;
  score: number;
  reason: string;
}
