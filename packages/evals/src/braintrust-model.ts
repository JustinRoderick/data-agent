import type { Evaluator } from "braintrust";

import type { EvalExpected, EvalInput, EvalMetadata, EvalOutput } from "./schemas";
import { loadEvalEnv } from "./env";
import { cloudCostModelAnswerEvalCases } from "./scenarios";
import {
  answerExpectedFacts,
  answerQuality,
  citationGrounding,
  dateFilter,
  metricSelection,
  requiredSqlFragments,
  requiredTables,
  sandboxUsed,
  sqlSafety,
} from "./scorers";
import { runCloudCostModelEvalTask } from "./task";

loadEvalEnv();

export const braintrustModelProjectName =
  process.env.BRAINTRUST_PROJECT_NAME ?? "openai-demo-bi-metrics-copilot";

export const cloudCostModelAnswerEvaluator: Evaluator<
  EvalInput,
  EvalOutput,
  EvalExpected,
  EvalMetadata
> = {
  experimentName: `model-answer-cloud-cost-agent-${new Date().toISOString()}`,
  description:
    "Model-backed answer accuracy eval for the Cloud Cost Metrics Copilot using mock Databricks data.",
  data: cloudCostModelAnswerEvalCases,
  task: async (input, { span, metadata }) => {
    span.log({
      metadata: {
        scenarioId: metadata.scenarioId,
        category: metadata.category,
        dataMode: "mock",
        modelBackedAgents: true,
      },
    });

    return runCloudCostModelEvalTask(input);
  },
  scores: [
    metricSelection,
    requiredTables,
    requiredSqlFragments,
    sqlSafety,
    dateFilter,
    sandboxUsed,
    citationGrounding,
    answerQuality,
    answerExpectedFacts,
  ],
  metadata: {
    dataMode: "mock",
    modelBackedAgents: true,
    workflow: "cloud-cost-copilot",
  },
  maxConcurrency: 1,
};
