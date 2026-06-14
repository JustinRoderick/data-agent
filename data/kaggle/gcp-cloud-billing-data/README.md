# GCP Cloud Billing Data

Source: [Kaggle: GCP-Cloud-Billing-Data](https://www.kaggle.com/datasets/sairamn19/gcp-cloud-billing-data)

This dataset is the seed dataset for the Cloud Cost Metrics Copilot demo. It contains 1,000 GCP billing and utilization records across services, regions, usage units, resource IDs, start/end timestamps, network bytes, CPU/memory utilization, and cost fields.

## Local Files

- `raw/gcp-cloud-billing-data.zip`: downloaded Kaggle dataset archive.
- `raw/gcp_final_approved_dataset.csv`: original Kaggle CSV.
- `processed/gcp_billing_usage.csv`: normalized CSV with snake_case headers and ISO timestamps.
- `processed/profile.json`: generated dataset profile for docs, evals, and demo setup.
- `schema/databricks-ddl.sql`: Databricks table DDL and loading notes.

## Regenerate Processed Data

```bash
bun run data:prepare:gcp-billing
```

## Demo Table

Use the processed CSV as the local mock source and load it into Databricks as:

```txt
bi_demo.gcp_billing_usage
```

The primary metric for the first demo slice should be `cloud_spend_usd`, defined as the sum of `rounded_cost_usd`.
