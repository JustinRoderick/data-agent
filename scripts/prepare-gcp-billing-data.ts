import { mkdir, writeFile } from "node:fs/promises";

const sourcePath = "data/kaggle/gcp-cloud-billing-data/raw/gcp_final_approved_dataset.csv";
const outputDir = "data/kaggle/gcp-cloud-billing-data/processed";
const outputCsvPath = `${outputDir}/gcp_billing_usage.csv`;
const profilePath = `${outputDir}/profile.json`;

const sourceColumns = [
  "Resource ID",
  "Service Name",
  "Usage Quantity",
  "Usage Unit",
  "Region/Zone",
  "CPU Utilization (%)",
  "Memory Utilization (%)",
  "Network Inbound Data (Bytes)",
  "Network Outbound Data (Bytes)",
  "Usage Start Date",
  "Usage End Date",
  "Cost per Quantity ($)",
  "Unrounded Cost ($)",
  "Rounded Cost ($)",
  "Total Cost (INR)",
] as const;

const outputColumns = [
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
] as const;

type SourceColumn = (typeof sourceColumns)[number];

interface PreparedRow {
  resource_id: string;
  service_name: string;
  usage_quantity: string;
  usage_unit: string;
  region_zone: string;
  cpu_utilization_pct: string;
  memory_utilization_pct: string;
  network_inbound_bytes: string;
  network_outbound_bytes: string;
  usage_start_ts: string;
  usage_end_ts: string;
  cost_per_quantity_usd: string;
  unrounded_cost_usd: string;
  rounded_cost_usd: string;
  total_cost_inr: string;
}

const text = await Bun.file(sourcePath).text();
const [headerLine, ...dataLines] = text.trim().split(/\r?\n/u);

if (!headerLine) {
  throw new Error(`Missing CSV header in ${sourcePath}`);
}

const headers = parseCsvLine(headerLine);
const indexByColumn = new Map(headers.map((header, index) => [header, index]));

for (const column of sourceColumns) {
  if (!indexByColumn.has(column)) {
    throw new Error(`Missing expected column: ${column}`);
  }
}

const rows = dataLines.map((line) => prepareRow(parseCsvLine(line), indexByColumn));
const profile = createProfile(rows);
const outputLines = [
  outputColumns.join(","),
  ...rows.map((row) => outputColumns.map((column) => escapeCsv(row[column])).join(",")),
];

await mkdir(outputDir, { recursive: true });
await writeFile(outputCsvPath, `${outputLines.join("\n")}\n`);
await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);

console.log(`Prepared ${rows.length} rows.`);
console.log(`Wrote ${outputCsvPath}`);
console.log(`Wrote ${profilePath}`);

function prepareRow(values: string[], indexByColumn: Map<string, number>): PreparedRow {
  const value = (column: SourceColumn) => {
    const index = indexByColumn.get(column);

    if (index === undefined) {
      throw new Error(`Missing expected column: ${column}`);
    }

    return values[index] ?? "";
  };

  return {
    resource_id: value("Resource ID"),
    service_name: value("Service Name"),
    usage_quantity: value("Usage Quantity"),
    usage_unit: value("Usage Unit"),
    region_zone: value("Region/Zone"),
    cpu_utilization_pct: value("CPU Utilization (%)"),
    memory_utilization_pct: value("Memory Utilization (%)"),
    network_inbound_bytes: value("Network Inbound Data (Bytes)"),
    network_outbound_bytes: value("Network Outbound Data (Bytes)"),
    usage_start_ts: toIsoTimestamp(value("Usage Start Date")),
    usage_end_ts: toIsoTimestamp(value("Usage End Date")),
    cost_per_quantity_usd: value("Cost per Quantity ($)"),
    unrounded_cost_usd: value("Unrounded Cost ($)"),
    rounded_cost_usd: value("Rounded Cost ($)"),
    total_cost_inr: value("Total Cost (INR)"),
  };
}

function toIsoTimestamp(value: string): string {
  const [datePart, timePart] = value.split(" ");
  const [day, month, year] = datePart?.split("-") ?? [];

  if (!day || !month || !year || !timePart) {
    throw new Error(`Invalid timestamp: ${value}`);
  }

  return `${year}-${month}-${day}T${timePart}:00`;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (const char of line) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function escapeCsv(value: string): string {
  if (!/[",\n\r]/u.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function createProfile(rows: PreparedRow[]) {
  const services = new Set<string>();
  const regions = new Set<string>();
  const usageUnits = new Set<string>();
  let minUsageStartTs = "9999-12-31T23:59:59";
  let maxUsageEndTs = "0000-01-01T00:00:00";
  let roundedCostUsdTotal = 0;
  let totalCostInrTotal = 0;

  for (const row of rows) {
    services.add(row.service_name);
    regions.add(row.region_zone);
    usageUnits.add(row.usage_unit);
    minUsageStartTs = row.usage_start_ts < minUsageStartTs ? row.usage_start_ts : minUsageStartTs;
    maxUsageEndTs = row.usage_end_ts > maxUsageEndTs ? row.usage_end_ts : maxUsageEndTs;
    roundedCostUsdTotal += Number(row.rounded_cost_usd);
    totalCostInrTotal += Number(row.total_cost_inr);
  }

  return {
    source: "kaggle:sairamn19/gcp-cloud-billing-data",
    rawFile: sourcePath,
    processedFile: outputCsvPath,
    rowCount: rows.length,
    services: [...services].sort(),
    regions: [...regions].sort(),
    usageUnits: [...usageUnits].sort(),
    minUsageStartTs,
    maxUsageEndTs,
    roundedCostUsdTotal,
    totalCostInrTotal,
  };
}
