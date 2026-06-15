import { runCloudCostCopilot, type CopilotRunEvent } from "@openai-demo/agents";
import { MockDatabricksConnector, type DatabricksColumn } from "@openai-demo/databricks";
import { InMemoryRagConnector } from "@openai-demo/rag";

import type { EvalInput, EvalOutput } from "./schemas";

const tableName = "main.bi_demo.gcp_billing_usage";

export async function runCloudCostEvalTask(input: EvalInput): Promise<EvalOutput> {
  return runCloudCostEvalTaskWithMode(input, { useModel: false });
}

export async function runCloudCostModelEvalTask(input: EvalInput): Promise<EvalOutput> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for model-backed agent answer evals.");
  }

  return runCloudCostEvalTaskWithMode(input, { useModel: true });
}

async function runCloudCostEvalTaskWithMode(
  input: EvalInput,
  { useModel }: { useModel: boolean },
): Promise<EvalOutput> {
  const events: CopilotRunEvent[] = [];
  const result = await runCloudCostCopilot(input, {
    databricks: createMockDatabricks(),
    sandboxDatabricks: createMockDatabricks(),
    rag: createMockRag(),
    tableName,
    useModel,
    onEvent: (event) => {
      events.push(event);
    },
  });

  return {
    question: result.question,
    answer: result.answer,
    sql: result.sql,
    citations: result.citations,
    rows: result.rows,
    events,
    metricId: inferMetricId(result.sql),
    usedTables: extractUsedTables(result.sql),
    usedSandbox: events.some(
      (event) => event.step === "sandbox_validation" && event.status === "completed",
    ),
    executedLiveDatabricks: input.runMode === "live",
  };
}

function createMockDatabricks(): MockDatabricksConnector {
  return new EvalDatabricksConnector();
}

class EvalDatabricksConnector extends MockDatabricksConnector {
  constructor() {
    super(createBillingColumns(), serviceSpendRows);
  }

  override async runReadOnlyQuery<
    TRecord extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string) {
    await super.runReadOnlyQuery(sql);

    if (/\bregion_zone\b/iu.test(sql)) {
      return createQueryResult(regionSpendRows as unknown as TRecord[]);
    }

    if (/\bcpu_utilization_pct\b/iu.test(sql) || /\bmemory_utilization_pct\b/iu.test(sql)) {
      return createQueryResult(utilizationSpendRows as unknown as TRecord[]);
    }

    return createQueryResult(serviceSpendRows as unknown as TRecord[]);
  }
}

const serviceSpendRows = [
  {
    service_name: "BigQuery",
    cloud_spend_usd: 128_450.25,
  },
  {
    service_name: "Compute Engine",
    cloud_spend_usd: 98_110.5,
  },
];

const utilizationSpendRows = [
  {
    service_name: "BigQuery",
    cloud_spend_usd: 128_450.25,
    avg_cpu_utilization_pct: 42.7,
    avg_memory_utilization_pct: 61.2,
  },
  {
    service_name: "Compute Engine",
    cloud_spend_usd: 98_110.5,
    avg_cpu_utilization_pct: 35.2,
    avg_memory_utilization_pct: 58.4,
  },
];

const regionSpendRows = [
  {
    region_zone: "us-central1",
    cloud_spend_usd: 76_240.75,
  },
  {
    region_zone: "us-east1",
    cloud_spend_usd: 41_205.1,
  },
];

function createQueryResult<TRecord extends Record<string, unknown>>(rows: TRecord[]) {
  return {
    rows,
    rowCount: rows.length,
    queryId: "mock-query",
    elapsedMs: 0,
  };
}

function createBillingColumns(): DatabricksColumn[] {
  const columns: Array<[string, string]> = [
    ["resource_id", "STRING"],
    ["service_name", "STRING"],
    ["usage_quantity", "DOUBLE"],
    ["usage_unit", "STRING"],
    ["region_zone", "STRING"],
    ["cpu_utilization_pct", "DOUBLE"],
    ["memory_utilization_pct", "DOUBLE"],
    ["network_inbound_bytes", "DOUBLE"],
    ["network_outbound_bytes", "DOUBLE"],
    ["usage_start_ts", "TIMESTAMP"],
    ["usage_end_ts", "TIMESTAMP"],
    ["cost_per_quantity_usd", "DOUBLE"],
    ["unrounded_cost_usd", "DOUBLE"],
    ["rounded_cost_usd", "DOUBLE"],
    ["total_cost_inr", "DOUBLE"],
  ];

  return columns.map(([columnName, dataType]) => ({
    tableName: "gcp_billing_usage",
    columnName,
    dataType,
  }));
}

function createMockRag(): InMemoryRagConnector {
  return new InMemoryRagConnector([
    {
      id: "cloud-spend-usd",
      title: "Cloud Spend USD",
      sourcePath: "metrics/cloud_spend_usd.md",
      content:
        "cloud_spend_usd is the governed cloud cost metric. Calculate it as SUM(rounded_cost_usd).",
      tags: ["metrics"],
    },
    {
      id: "gcp-billing-usage",
      title: "GCP Billing Usage Table",
      sourcePath: "tables/gcp_billing_usage.md",
      content:
        "The gcp_billing_usage table includes service_name, region_zone, usage_start_ts, rounded_cost_usd, cpu_utilization_pct, and memory_utilization_pct.",
      tags: ["tables"],
    },
    {
      id: "cloud-cost-spike-analysis",
      title: "Cloud Cost Spike Analysis",
      sourcePath: "runbooks/cloud_cost_spike_analysis.md",
      content:
        "For spend investigations, compare services and regions first. Caveat that project labels, credits, discounts, and SKU identifiers may be absent in demo data.",
      tags: ["runbooks"],
    },
  ]);
}

function inferMetricId(sql: string): string | undefined {
  return /sum\s*\(\s*rounded_cost_usd\s*\)/iu.test(sql) ? "cloud_spend_usd" : undefined;
}

function extractUsedTables(sql: string): string[] {
  return [...sql.matchAll(/\b(?:from|join)\s+([`"A-Za-z0-9_.]+)/giu)].map((match) =>
    normalizeTableReference(match[1] ?? ""),
  );
}

function normalizeTableReference(tableName: string): string {
  return tableName.replaceAll(/[`"]/gu, "").trim().toLowerCase();
}
