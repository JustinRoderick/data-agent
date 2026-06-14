# Cloud Cost Spike Analysis Runbook

Use this runbook when a user asks why cloud cost increased, spiked, or changed over time.

## Recommended Analysis Steps

1. Compare total `cloud_spend_usd` for the requested period against the previous comparable period.
2. Break the delta down by `service_name`.
3. Break the largest service deltas down by `region_zone`.
4. Check whether `usage_quantity`, CPU utilization, memory utilization, or network bytes increased alongside cost.
5. Identify the top contributing `resource_id` values.
6. State caveats clearly if the dataset does not contain ownership labels, project IDs, SKU IDs, discounts, commitments, or amortized cost fields.

## Useful SQL Patterns

```sql
SELECT
  service_name,
  SUM(rounded_cost_usd) AS cloud_spend_usd
FROM bi_demo.gcp_billing_usage
WHERE usage_start_ts >= TIMESTAMP '2024-08-01'
  AND usage_start_ts < TIMESTAMP '2024-09-01'
GROUP BY service_name
ORDER BY cloud_spend_usd DESC
LIMIT 10;
```
