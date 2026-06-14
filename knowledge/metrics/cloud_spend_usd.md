# Cloud Spend USD

Metric ID: `cloud_spend_usd`

## Definition

Cloud spend in USD is the sum of `rounded_cost_usd` from `bi_demo.gcp_billing_usage`.

## Grain

The source table records GCP billing usage intervals. The default reporting grains are day, week, month, service, and region.

## Source

- Table: `bi_demo.gcp_billing_usage`
- Field: `rounded_cost_usd`

## Common Dimensions

- `service_name`
- `region_zone`
- `usage_unit`
- `resource_id`

## Caveats

- The source dataset is a Kaggle demo dataset, not an official Google Cloud Billing export.
- Use `rounded_cost_usd` for standard demo reporting.
- Use `unrounded_cost_usd` only when a question asks for more precise cost calculations.
