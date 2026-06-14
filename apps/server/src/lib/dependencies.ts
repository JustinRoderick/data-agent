import { readFile } from "node:fs/promises";

import {
  MockDatabricksConnector,
  createDatabricksConnectorFromEnv,
  type DatabricksColumn,
  type DatabricksConnector,
  type DatabricksQueryResult,
} from "@openai-demo/databricks";
import { env } from "@openai-demo/env/server";
import {
  InMemoryRagConnector,
  createRagConnectorFromEnv,
  loadKnowledgeDocumentsFromDirectory,
  type RagConnector,
} from "@openai-demo/rag";

interface GcpBillingRow {
  [key: string]: string | number;
  resource_id: string;
  service_name: string;
  usage_quantity: number;
  usage_unit: string;
  region_zone: string;
  cpu_utilization_pct: number;
  memory_utilization_pct: number;
  network_inbound_bytes: number;
  network_outbound_bytes: number;
  usage_start_ts: string;
  usage_end_ts: string;
  cost_per_quantity_usd: number;
  unrounded_cost_usd: number;
  rounded_cost_usd: number;
  total_cost_inr: number;
}

const billingCsvPath = "data/kaggle/gcp-cloud-billing-data/processed/gcp_billing_usage.csv";

export async function createCopilotDependencies() {
  const [databricks, sandboxDatabricks, rag] = await Promise.all([
    createDatabricks(),
    createSandboxDatabricks(),
    createRag(),
  ]);

  return {
    databricks,
    sandboxDatabricks,
    rag,
    tableName: `${env.DATABRICKS_CATALOG}.${env.DATABRICKS_SCHEMA}.gcp_billing_usage`,
    useModel: Boolean(env.OPENAI_API_KEY),
  };
}

async function createDatabricks(): Promise<DatabricksConnector> {
  if (!env.USE_MOCK_DATABRICKS) {
    return createDatabricksConnectorFromEnv({
      DATABRICKS_SERVER_HOSTNAME: env.DATABRICKS_SERVER_HOSTNAME,
      DATABRICKS_HTTP_PATH: env.DATABRICKS_HTTP_PATH,
      DATABRICKS_TOKEN: env.DATABRICKS_TOKEN,
      DATABRICKS_CATALOG: env.DATABRICKS_CATALOG,
      DATABRICKS_SCHEMA: env.DATABRICKS_SCHEMA,
      DATABRICKS_QUERY_TAG: env.DATABRICKS_QUERY_TAG,
      DATABRICKS_MAX_ROWS: env.DATABRICKS_MAX_ROWS,
    });
  }

  const rows = await loadBillingRows();
  return new LocalBillingDatabricksConnector(rows);
}

async function createSandboxDatabricks(): Promise<DatabricksConnector> {
  return new LocalBillingDatabricksConnector(await loadBillingRows());
}

async function createRag(): Promise<RagConnector> {
  const openAiRag = createRagConnectorFromEnv({
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_VECTOR_STORE_ID: env.OPENAI_VECTOR_STORE_ID,
  });

  if (openAiRag) {
    return openAiRag;
  }

  return new InMemoryRagConnector(await loadKnowledgeDocumentsFromDirectory("knowledge"));
}

class LocalBillingDatabricksConnector extends MockDatabricksConnector {
  constructor(private readonly billingRows: GcpBillingRow[]) {
    super(createBillingColumns(), billingRows);
  }

  override async runReadOnlyQuery<
    TRecord extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string): Promise<DatabricksQueryResult<TRecord>> {
    const rows = runLocalBillingQuery(sql, this.billingRows) as TRecord[];

    return {
      rows,
      rowCount: rows.length,
      queryId: "local-billing-query",
      elapsedMs: 0,
    };
  }
}

async function loadBillingRows(): Promise<GcpBillingRow[]> {
  const text = await readFile(billingCsvPath, "utf8");
  const [headerLine, ...lines] = text.trim().split(/\r?\n/u);
  const headers = headerLine?.split(",") ?? [];

  return lines.map((line) => {
    const values = line.split(",");
    const record = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
    const value = (key: string) => record[key] ?? "";

    return {
      resource_id: value("resource_id"),
      service_name: value("service_name"),
      usage_quantity: Number(value("usage_quantity")),
      usage_unit: value("usage_unit"),
      region_zone: value("region_zone"),
      cpu_utilization_pct: Number(value("cpu_utilization_pct")),
      memory_utilization_pct: Number(value("memory_utilization_pct")),
      network_inbound_bytes: Number(value("network_inbound_bytes")),
      network_outbound_bytes: Number(value("network_outbound_bytes")),
      usage_start_ts: value("usage_start_ts"),
      usage_end_ts: value("usage_end_ts"),
      cost_per_quantity_usd: Number(value("cost_per_quantity_usd")),
      unrounded_cost_usd: Number(value("unrounded_cost_usd")),
      rounded_cost_usd: Number(value("rounded_cost_usd")),
      total_cost_inr: Number(value("total_cost_inr")),
    };
  });
}

function runLocalBillingQuery(sql: string, rows: GcpBillingRow[]): Record<string, unknown>[] {
  const lowerSql = sql.toLowerCase();
  const augustRows = rows.filter(
    (row) =>
      row.usage_start_ts >= "2024-08-01T00:00:00" && row.usage_start_ts < "2024-09-01T00:00:00",
  );

  if (lowerSql.includes("region_zone")) {
    return aggregateBy(augustRows, "region_zone");
  }

  if (lowerSql.includes("avg(cpu_utilization_pct)")) {
    return aggregateBy(augustRows, "service_name", true);
  }

  return aggregateBy(augustRows, "service_name");
}

function aggregateBy(
  rows: GcpBillingRow[],
  key: "service_name" | "region_zone",
  includeUtilization = false,
): Record<string, unknown>[] {
  const groups = new Map<
    string,
    {
      cloud_spend_usd: number;
      cpu: number;
      memory: number;
      count: number;
    }
  >();

  for (const row of rows) {
    const group = groups.get(row[key]) ?? {
      cloud_spend_usd: 0,
      cpu: 0,
      memory: 0,
      count: 0,
    };
    group.cloud_spend_usd += row.rounded_cost_usd;
    group.cpu += row.cpu_utilization_pct;
    group.memory += row.memory_utilization_pct;
    group.count += 1;
    groups.set(row[key], group);
  }

  return [...groups.entries()]
    .map(([name, group]) => ({
      [key]: name,
      cloud_spend_usd: Math.round(group.cloud_spend_usd * 100) / 100,
      ...(includeUtilization
        ? {
            avg_cpu_utilization_pct: Math.round((group.cpu / group.count) * 100) / 100,
            avg_memory_utilization_pct: Math.round((group.memory / group.count) * 100) / 100,
          }
        : {}),
    }))
    .sort((left, right) => Number(right.cloud_spend_usd) - Number(left.cloud_spend_usd))
    .slice(0, 10);
}

function createBillingColumns(): DatabricksColumn[] {
  return [
    "resource_id",
    "service_name",
    "usage_quantity",
    "usage_unit",
    "region_zone",
    "cpu_utilization_pct",
    "memory_utilization_pct",
    "network_inbound_bytes",
    "network_outbound_bytes",
    "usage_start_ts",
    "usage_end_ts",
    "cost_per_quantity_usd",
    "unrounded_cost_usd",
    "rounded_cost_usd",
    "total_cost_inr",
  ].map((columnName) => ({
    tableName: "gcp_billing_usage",
    columnName,
    dataType: "string",
  }));
}
