# Table: bi_demo.gcp_billing_usage

The `bi_demo.gcp_billing_usage` table contains normalized GCP cloud billing and utilization data from the Kaggle `sairamn19/gcp-cloud-billing-data` dataset.

## Important Columns

- `resource_id`: cloud resource identifier.
- `service_name`: GCP service associated with the usage and cost.
- `usage_quantity`: numeric usage quantity.
- `usage_unit`: unit of measure for usage.
- `region_zone`: GCP region or zone.
- `cpu_utilization_pct`: CPU utilization percentage.
- `memory_utilization_pct`: memory utilization percentage.
- `network_inbound_bytes`: inbound network traffic in bytes.
- `network_outbound_bytes`: outbound network traffic in bytes.
- `usage_start_ts`: usage interval start timestamp.
- `usage_end_ts`: usage interval end timestamp.
- `rounded_cost_usd`: primary cost metric in USD.
- `total_cost_inr`: total cost in INR from the source dataset.

## Recommended Usage

Use this table for cloud cost questions by service, region, usage unit, resource, and time period.

Preferred cost field:

```sql
SUM(rounded_cost_usd)
```

Preferred date field:

```sql
usage_start_ts
```
