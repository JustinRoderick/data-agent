import { describe, expect, it } from "vitest";

import {
  cloudCostEvalCases,
  cloudCostModelAnswerEvalCases,
  evalScenarioSchema,
  runCloudCostEvalTask,
  scoreScenario,
} from "./index";

describe("cloud cost evals", () => {
  it("fills default eval expectations for cloud cost scenarios", () => {
    const scenario = evalScenarioSchema.parse({
      id: "top-services",
      input: {
        question: "What were the top services by spend?",
      },
      expected: {},
    });

    expect(scenario.input.runMode).toBe("mock");
    expect(scenario.expected).toMatchObject({
      metricId: "cloud_spend_usd",
      requiredTables: ["gcp_billing_usage"],
      shouldUseSandbox: true,
      shouldExecuteLiveDatabricks: false,
      shouldHaveCitations: true,
      expectedAnswerTerms: [],
      minimumAnswerTermMatches: 0,
    });
  });

  it("defines curated mock eval cases", () => {
    expect(cloudCostEvalCases.length).toBeGreaterThanOrEqual(5);
    expect(cloudCostEvalCases.map((testCase) => testCase.metadata.category)).toEqual(
      expect.arrayContaining(["spend", "safety", "grounding"]),
    );
  });

  it("defines model-backed answer accuracy cases", () => {
    expect(cloudCostModelAnswerEvalCases.length).toBeGreaterThanOrEqual(2);
    expect(
      cloudCostModelAnswerEvalCases.every(
        (testCase) =>
          testCase.expected.expectedAnswerTerms.length > 0 &&
          testCase.expected.minimumAnswerTermMatches > 0,
      ),
    ).toBe(true);
  });

  it("scores deterministic workflow expectations", () => {
    const scores = scoreScenario(
      {
        metricId: "cloud_spend_usd",
        requiredTables: ["gcp_billing_usage"],
        requiredSqlFragments: ["SUM(rounded_cost_usd)", "usage_start_ts"],
        forbiddenSqlFragments: ["DROP "],
        shouldUseSandbox: true,
        shouldExecuteLiveDatabricks: false,
        shouldHaveCitations: true,
        minimumRows: 1,
        expectedAnswerTerms: ["BigQuery", "cloud spend"],
        minimumAnswerTermMatches: 2,
      },
      {
        question: "Top services?",
        answer: "The query returned rows for cloud spend. BigQuery was the top service.",
        sql: `
          SELECT service_name, SUM(rounded_cost_usd) AS cloud_spend_usd
          FROM main.bi_demo.gcp_billing_usage
          WHERE usage_start_ts >= TIMESTAMP '2024-08-01'
          GROUP BY service_name
        `,
        citations: [
          {
            title: "Cloud Spend USD",
            excerpt: "Use SUM(rounded_cost_usd).",
          },
        ],
        rows: [{ service_name: "BigQuery", cloud_spend_usd: 100 }],
        events: [],
        metricId: "cloud_spend_usd",
        usedTables: ["main.bi_demo.gcp_billing_usage"],
        usedSandbox: true,
        executedLiveDatabricks: false,
      },
    );

    expect(scores.every((score) => score.score === 1)).toBe(true);
  });

  it("scores expected answer facts with partial credit", () => {
    const scores = scoreScenario(
      {
        metricId: "cloud_spend_usd",
        requiredTables: ["gcp_billing_usage"],
        requiredSqlFragments: ["SUM(rounded_cost_usd)"],
        forbiddenSqlFragments: ["DROP "],
        shouldUseSandbox: true,
        shouldExecuteLiveDatabricks: false,
        shouldHaveCitations: true,
        minimumRows: 1,
        expectedAnswerTerms: ["BigQuery", "Compute Engine", "cloud spend"],
        minimumAnswerTermMatches: 2,
      },
      {
        question: "Top services?",
        answer: "BigQuery had the highest cloud spend in the returned rows.",
        sql: "SELECT service_name, SUM(rounded_cost_usd) AS cloud_spend_usd FROM main.bi_demo.gcp_billing_usage WHERE usage_start_ts >= TIMESTAMP '2024-08-01'",
        citations: [{ title: "Cloud Spend USD", excerpt: "Use SUM(rounded_cost_usd)." }],
        rows: [{ service_name: "BigQuery", cloud_spend_usd: 100 }],
        events: [],
        metricId: "cloud_spend_usd",
        usedTables: ["main.bi_demo.gcp_billing_usage"],
        usedSandbox: true,
        executedLiveDatabricks: false,
      },
    );

    expect(scores.find((score) => score.name === "answer_expected_facts")?.score).toBe(1);
  });

  it("runs the mock cloud cost eval task through the real copilot workflow", async () => {
    const output = await runCloudCostEvalTask({
      question: "What were the top GCP services by cloud spend in August 2024?",
      runMode: "mock",
    });

    expect(output.sql).toContain("SUM(rounded_cost_usd)");
    expect(output.usedTables).toContain("main.bi_demo.gcp_billing_usage");
    expect(output.usedSandbox).toBe(true);
    expect(output.executedLiveDatabricks).toBe(false);
    expect(output.citations.length).toBeGreaterThan(0);
  });
});
