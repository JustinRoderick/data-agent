import { describe, expect, it } from "vitest";

import { copilotQuestionSchema, createInitialRunPlan } from "./index";

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
});
