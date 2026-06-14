import { describe, expect, it } from "vitest";

import { evalScenarioSchema, scoreScenario } from "./index";

describe("evals scaffold", () => {
  it("fills default eval expectations", () => {
    const scenario = evalScenarioSchema.parse({
      id: "weekly-revenue",
      input: { question: "What is weekly revenue?" },
      expected: { metricId: "weekly_revenue" },
    });

    expect(scenario.expected).toMatchObject({
      metricId: "weekly_revenue",
      requiredTables: [],
      shouldUseSandbox: true,
      shouldExecuteDatabricks: false,
    });
  });

  it("scores deterministic workflow expectations", () => {
    const scores = scoreScenario(
      {
        id: "weekly-revenue",
        input: { question: "What is weekly revenue by segment?" },
        expected: {
          metricId: "weekly_revenue",
          requiredTables: ["fact_revenue", "dim_customer"],
          shouldUseSandbox: true,
          shouldExecuteDatabricks: false,
        },
      },
      {
        metricId: "weekly_revenue",
        usedTables: ["fact_revenue", "dim_customer"],
        usedSandbox: true,
        executedDatabricks: false,
        finalAnswer: "Weekly revenue is grouped by segment.",
      },
    );

    expect(scores.every((score) => score.score === 1)).toBe(true);
  });
});
