import type { Evaluator } from "braintrust";

import type { EvalExpected, EvalInput, EvalMetadata, EvalOutput } from "./schemas";
import { loadEvalEnv } from "./env";
import { cloudCostEvalCases } from "./scenarios";
import {
  answerQuality,
  citationGrounding,
  dateFilter,
  liveDatabricksUsage,
  metricSelection,
  requiredSqlFragments,
  requiredTables,
  sandboxUsed,
  sqlSafety,
} from "./scorers";
import { runCloudCostEvalTask } from "./task";

loadEvalEnv();

export const braintrustProjectName =
  process.env.BRAINTRUST_PROJECT_NAME ?? "openai-demo-bi-metrics-copilot";

export const cloudCostEvaluator: Evaluator<EvalInput, EvalOutput, EvalExpected, EvalMetadata> = {
  experimentName: `mock-cloud-cost-agent-${new Date().toISOString()}`,
  description: "Mock-data regression eval for the Cloud Cost Metrics Copilot agentic workflow.",
  data: cloudCostEvalCases,
  task: async (input, { span, metadata }) => {
    span.log({
      metadata: {
        scenarioId: metadata.scenarioId,
        category: metadata.category,
        dataMode: "mock",
      },
    });

    return runCloudCostEvalTask(input);
  },
  scores: [
    metricSelection,
    requiredTables,
    requiredSqlFragments,
    sqlSafety,
    dateFilter,
    sandboxUsed,
    liveDatabricksUsage,
    citationGrounding,
    answerQuality,
  ],
  metadata: {
    dataMode: "mock",
    workflow: "cloud-cost-copilot",
  },
  maxConcurrency: 1,
};
