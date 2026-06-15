import { describe, expect, it } from "vitest";

import { MockDatabricksConnector } from "@openai-demo/databricks";
import { InMemoryRagConnector } from "@openai-demo/rag";

import {
  analysisPlanSchema,
  copilotQuestionSchema,
  createCloudCostAgentDefinitions,
  createInitialRunPlan,
  runCloudCostCopilot,
  type SchemaAssessment,
  sandboxValidationResultSchema,
  schemaAssessmentSchema,
  sqlDraftSchema,
  sqlSafetyResultSchema,
} from "./index";
import { extractSql, validateSqlDraft } from "./sql";

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
    const events: unknown[] = [];
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
        onEvent: (event) => {
          events.push(event);
        },
      },
    );

    expect(result.sql).toContain("SUM(rounded_cost_usd)");
    expect(result.answer).toContain("Cloud Dataproc");
    expect(result.citations).toHaveLength(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "schema_lookup", status: "completed" }),
        expect.objectContaining({ step: "sandbox_validation", status: "completed" }),
      ]),
    );
  });

  it("normalizes model SQL output while preserving multi-statement safety", () => {
    const schemaAssessment: SchemaAssessment = {
      tableName: "main.bi_demo.gcp_billing_usage",
      columns: [
        { columnName: "service_name", dataType: "STRING" },
        { columnName: "rounded_cost_usd", dataType: "DOUBLE" },
        { columnName: "usage_start_ts", dataType: "TIMESTAMP" },
      ],
      dateColumn: "usage_start_ts",
      costColumn: "rounded_cost_usd",
      supportedDimensions: ["service_name"],
      unsupportedFields: [],
      warnings: [],
    };
    const tableName = "main.bi_demo.gcp_billing_usage";
    const normalized = extractSql(`
      Here is the query:

      \`\`\`sql
      SELECT service_name, SUM(rounded_cost_usd) AS cloud_spend_usd
      FROM main.bi_demo.gcp_billing_usage
      WHERE usage_start_ts >= TIMESTAMP '2024-08-01'
      GROUP BY service_name;
      \`\`\`
    `);

    expect(normalized.endsWith(";")).toBe(false);
    expect(validateSqlDraft(normalized, tableName, schemaAssessment).passed).toBe(true);
    expect(validateSqlDraft(`${normalized}; SELECT 1`, tableName, schemaAssessment).passed).toBe(
      false,
    );
  });

  it("falls back to deterministic SQL when model SQL fails safety", async () => {
    const events: unknown[] = [];
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
        rag: new InMemoryRagConnector([]),
        useModel: true,
        onEvent: (event) => {
          events.push(event);
        },
        modelRunner: async (agent) => {
          if (agent.name === "Databricks SQL Analyst Agent") {
            return {
              sql: "SELECT * FROM main.bi_demo.gcp_billing_usage; SELECT 1",
            };
          }

          if (agent.name === "Cloud Cost Narrative Agent") {
            return {
              answer: "The query returned rows for cloud spend.",
              caveats: [],
              followUpQuestions: [],
            };
          }

          return undefined;
        },
      },
    );

    expect(result.sql).toContain("SUM(rounded_cost_usd)");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "sql_safety",
          message: expect.stringContaining("falling back to deterministic SQL"),
        }),
        expect.objectContaining({ step: "narrative", status: "completed" }),
      ]),
    );
  });

  it("parses structured specialist outputs", () => {
    expect(
      analysisPlanSchema.parse({
        questionType: "spend_breakdown",
        normalizedQuestion: "Top services by spend",
      }).metricId,
    ).toBe("cloud_spend_usd");
    expect(
      schemaAssessmentSchema.parse({
        tableName: "main.bi_demo.gcp_billing_usage",
        columns: [{ columnName: "rounded_cost_usd", dataType: "DOUBLE" }],
      }).costColumn,
    ).toBe("rounded_cost_usd");
    expect(
      sqlDraftSchema.parse({
        sql: "SELECT service_name FROM main.bi_demo.gcp_billing_usage WHERE usage_start_ts >= TIMESTAMP '2024-08-01'",
      }).timeWindow,
    ).toBe("August 2024");
    expect(sqlSafetyResultSchema.parse({ passed: true }).reasons).toEqual([]);
    expect(
      sandboxValidationResultSchema.parse({
        passed: true,
        rowCount: 1,
        previewRows: [{ service_name: "Cloud Run" }],
      }).warnings,
    ).toEqual([]);
  });

  it("creates OpenAI Agents SDK definitions for the cloud cost workflow", () => {
    const definitions = createCloudCostAgentDefinitions({
      databricks: new MockDatabricksConnector(),
      rag: new InMemoryRagConnector([]),
    });

    expect(definitions.coordinatorAgent.name).toBe("Cloud Cost Coordinator Agent");
    expect(definitions.tools.searchMetricContext.name).toBe("search_metric_context");
    expect(definitions.tools.listDatabricksColumns.name).toBe("list_databricks_columns");
    expect(definitions.sandboxAgent.name).toBe("Sandbox Validation Agent");
  });
});
