import { createDatabricksConnectorFromEnv } from "@openai-demo/databricks";
import { config } from "dotenv";

config({ path: "apps/server/.env" });

const connector = createDatabricksConnectorFromEnv(process.env);
const tableName = `${process.env.DATABRICKS_CATALOG ?? "main"}.${process.env.DATABRICKS_SCHEMA ?? "bi_demo"}.gcp_billing_usage`;

console.log(`Checking Databricks connection against ${tableName}...`);

const healthy = await connector.healthCheck();

if (!healthy) {
  throw new Error("Databricks health check failed.");
}

const columns = await connector.listColumns(tableName);
const preview = await connector.getTablePreview(tableName, 5);

console.log(`Connection OK.`);
console.log(`Found ${columns.length} columns.`);
console.log(`Fetched ${preview.rowCount} preview rows.`);
console.table(preview.rows);
