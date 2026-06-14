CREATE SCHEMA IF NOT EXISTS bi_demo;

CREATE TABLE IF NOT EXISTS bi_demo.gcp_billing_usage (
  resource_id STRING COMMENT 'Cloud resource identifier from the Kaggle billing dataset.',
  service_name STRING COMMENT 'GCP service that generated the usage or cost.',
  usage_quantity DOUBLE COMMENT 'Measured usage quantity for the billing line.',
  usage_unit STRING COMMENT 'Unit for the usage quantity, such as GB, Hours, or Requests.',
  region_zone STRING COMMENT 'GCP region or zone associated with the billing line.',
  cpu_utilization_pct DOUBLE COMMENT 'CPU utilization percentage associated with the record.',
  memory_utilization_pct DOUBLE COMMENT 'Memory utilization percentage associated with the record.',
  network_inbound_bytes BIGINT COMMENT 'Inbound network bytes associated with the record.',
  network_outbound_bytes BIGINT COMMENT 'Outbound network bytes associated with the record.',
  usage_start_ts TIMESTAMP COMMENT 'Usage interval start timestamp.',
  usage_end_ts TIMESTAMP COMMENT 'Usage interval end timestamp.',
  cost_per_quantity_usd DOUBLE COMMENT 'Cost per usage quantity in USD.',
  unrounded_cost_usd DOUBLE COMMENT 'Unrounded cost in USD.',
  rounded_cost_usd DOUBLE COMMENT 'Rounded cost in USD; primary field for cloud spend metrics.',
  total_cost_inr BIGINT COMMENT 'Total cost in INR from the source dataset.'
)
USING DELTA
COMMENT 'Normalized GCP cloud billing and utilization data from Kaggle for the Cloud Cost Metrics Copilot demo.';

-- Recommended Databricks load flow:
-- 1. Upload data/kaggle/gcp-cloud-billing-data/processed/gcp_billing_usage.csv to a volume or external location.
-- 2. Replace the path below with the uploaded CSV path.
-- 3. Run COPY INTO to load the table.
--
-- COPY INTO bi_demo.gcp_billing_usage
-- FROM '/Volumes/<catalog>/<schema>/<volume>/gcp_billing_usage.csv'
-- FILEFORMAT = CSV
-- FORMAT_OPTIONS ('header' = 'true', 'inferSchema' = 'false', 'timestampFormat' = "yyyy-MM-dd'T'HH:mm:ss");
