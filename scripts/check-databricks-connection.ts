import { createDatabricksConnectorFromEnv } from "@openai-demo/databricks";
import { config } from "dotenv";

config({ path: "apps/server/.env" });

const databricksEnv = {
  DATABRICKS_SERVER_HOSTNAME: process.env.DATABRICKS_SERVER_HOSTNAME,
  DATABRICKS_HTTP_PATH: process.env.DATABRICKS_HTTP_PATH,
  DATABRICKS_TOKEN: process.env.DATABRICKS_TOKEN,
  DATABRICKS_CATALOG: process.env.DATABRICKS_CATALOG,
  DATABRICKS_SCHEMA: process.env.DATABRICKS_SCHEMA,
  DATABRICKS_QUERY_TAG: process.env.DATABRICKS_QUERY_TAG,
  DATABRICKS_MAX_ROWS: process.env.DATABRICKS_MAX_ROWS,
};

const connector = createDatabricksConnectorFromEnv(databricksEnv);
const tableName = `${databricksEnv.DATABRICKS_CATALOG ?? "main"}.${databricksEnv.DATABRICKS_SCHEMA ?? "bi_demo"}.gcp_billing_usage`;

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
