import { describe, expect, it } from "vitest";

import { MockDatabricksConnector } from "@openai-demo/databricks";
import { InMemoryRagConnector } from "@openai-demo/rag";

import {
  copilotQuestionSchema,
  createCloudCostAgentDefinitions,
  createInitialRunPlan,
  runCloudCostCopilot,
} from "./index";

describe("agents scaffold", () => {
  it("normalizes valid copilot questions", () => {
    const parsed = copilotQuestionSchema.parse({
      question: "  What is weekly revenue by segment?  ",
    });

    expect(parsed).toEqual({
      question: "What is weekly revenue by segment?",
      runMode: "mock",
    });
  });

  it("creates an ordered initial run plan", () => {
    const plan = createInitialRunPlan({
      question: "What changed in March?",
      runMode: "live",
    });

    expect(plan.steps.map((step) => step.name)).toEqual([
      "coordinator",
      "metric_catalog",
      "schema_lookup",
      "sql_analyst",
      "sql_safety",
      "sandbox_validation",
      "databricks_execution",
      "narrative",
    ]);
    expect(plan.steps[0]?.status).toBe("running");
  });

  it("runs the first cloud cost copilot slice with mocked dependencies", async () => {
    const result = await runCloudCostCopilot(
      {
        question: "What were the top GCP services by cloud spend in August 2024?",
        runMode: "mock",
      },
      {
        databricks: new MockDatabricksConnector(
          [],
          [
            {
              service_name: "Cloud Dataproc",
              cloud_spend_usd: 5004,
            },
          ],
        ),
        rag: new InMemoryRagConnector([
          {
            id: "cloud-spend",
            title: "Cloud Spend USD",
            sourcePath: "metrics/cloud_spend_usd.md",
            content: "Cloud spend uses rounded_cost_usd.",
            tags: ["metrics"],
          },
        ]),
      },
    );

    expect(result.sql).toContain("SUM(rounded_cost_usd)");
    expect(result.answer).toContain("Cloud Dataproc");
    expect(result.citations).toHaveLength(1);
  });

  it("creates OpenAI Agents SDK definitions for the cloud cost workflow", () => {
    const definitions = createCloudCostAgentDefinitions({
      databricks: new MockDatabricksConnector(),
      rag: new InMemoryRagConnector([]),
    });

    expect(definitions.coordinatorAgent.name).toBe("Cloud Cost Coordinator Agent");
    expect(definitions.tools.searchMetricContext.name).toBe("search_metric_context");
  });
});
