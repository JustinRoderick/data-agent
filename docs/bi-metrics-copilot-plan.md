# Cloud Cost Metrics Copilot For Databricks

## Project Goal

Build a Cloud Cost Metrics Copilot that lets an analyst ask governed cloud billing and FinOps questions in natural language, retrieves metric and table context from a RAG knowledge base, generates Databricks SQL, validates the query through safety checks and a sandbox agent, optionally executes against Databricks, and returns a cited BI-style answer with traceable reasoning and evaluation results.

The project should demonstrate:

- OpenAI Agents SDK multi-agent orchestration.
- An OpenAI sandbox agent for SQL/Python validation before live execution.
- OpenAI vector stores/file search for RAG over cloud cost metric definitions, table docs, FinOps notes, and BI runbooks.
- Databricks integration for SQL Warehouse execution and metadata lookup.
- Braintrust evals for regression testing the full agentic workflow.
- A TypeScript-first application stack with TanStack Start, Hono, Bun, Vite, Vitest, oxlint, and oxfmt.

## Technology Stack

### Frontend

- TanStack Start with React for the web app.
- TanStack Router for file-based routing.
- TanStack Query for API reads, mutations, run history, eval result loading, and catalog sync status.
- Tailwind CSS and shared UI primitives for styling.
- Vite as the frontend build tool.

### Backend

- Hono for the backend API.
- Bun for package management, scripts, and local development.
- Node-compatible backend boundaries for libraries that may not fully support Bun, especially Databricks SQL connectivity or agent sandbox execution.
- Zod for request/response validation and structured API contracts.

### Agent And AI Layer

- OpenAI Agents SDK for multi-agent orchestration, handoffs, tool calls, tracing, guardrails, and sandbox agents.
- OpenAI vector stores/file search for RAG.
- OpenAI models for agent reasoning, SQL generation, and answer synthesis.
- Braintrust for eval datasets, experiments, deterministic scorers, LLM-as-judge scorers, CI regression tests, and optional observability.

### Databricks Layer

- Databricks SQL Warehouse as the live query target.
- Databricks SQL Driver for Node.js for backend query execution.
- Unity Catalog or `information_schema` queries for schema/table/column metadata.
- Kaggle GCP cloud billing data as the demo billing fact table.
- Optional derived dimensions for service, region, usage unit, and date.
- Local mock data for offline sandbox validation.

### Persistence And Tooling

- Drizzle ORM with SQLite/libSQL for app metadata, auth, run history, eval results, and cached catalog metadata.
- Turborepo for monorepo task orchestration.
- Vitest for unit and integration tests.
- oxlint and oxfmt for linting and formatting.
- Docker Compose for local web/server packaging.

## Current Scaffold Alignment

The current repository already aligns with several planned technologies:

- [x] Bun workspaces are configured at the root.
- [x] Turborepo is configured for build, dev, type-checking, and database tasks.
- [x] `apps/web` uses TanStack Start, React, TanStack Router, TanStack Query, Vite, Tailwind CSS, and shared UI components.
- [x] `apps/server` uses Hono and exposes a basic health route plus Better Auth endpoints.
- [x] `packages/db` uses Drizzle with SQLite/libSQL.
- [x] `packages/auth` uses Better Auth.
- [x] `packages/env` uses typed environment validation.
- [x] oxlint and oxfmt are installed and exposed through `bun run check`.
- [x] Vitest is configured for workspace package tests.
- [x] Project plan documentation exists in `docs/`.

Major planned pieces:

- [x] `packages/agents` scaffold for OpenAI Agents SDK orchestration.
- [x] `packages/databricks` scaffold for SQL Warehouse and metadata access.
- [x] `packages/rag` scaffold for vector store ingestion and retrieval helpers.
- [x] `packages/evals` scaffold for Braintrust datasets, eval runners, and scorers.
- [x] Databricks, OpenAI, and Braintrust environment variables are represented in `packages/env`.
- [x] Example env files exist for the web and server apps.
- [x] Kaggle GCP cloud billing dataset is downloaded locally.
- [x] Normalized Databricks-ready CSV exists at `data/kaggle/gcp-cloud-billing-data/processed/gcp_billing_usage.csv`.
- [x] Databricks DDL exists at `data/kaggle/gcp-cloud-billing-data/schema/databricks-ddl.sql`.
- [x] Initial cloud cost metric, table, and runbook docs exist under `knowledge/`.
- [x] OpenAI Agents SDK dependency and agent definition scaffold in `packages/agents`.
- [ ] Full model-backed OpenAI Agents SDK run path in `packages/agents`.
- [x] Real Databricks SQL driver implementation in `packages/databricks`.
- [x] OpenAI vector store/file search connector in `packages/rag`.
- [ ] Vector store ingestion script for local `knowledge/` docs.
- [ ] Real Braintrust experiment runner in `packages/evals`.
- [ ] Agent run persistence tables in `packages/db`.
- [ ] UI routes for the copilot workspace, run details, SQL/results tabs, citation panel, and eval dashboard.
- [ ] Streaming API endpoints for agent run progress.

## Hono API Integration

Hono should be the thin HTTP boundary between the TanStack Start frontend and the project packages that contain the real application logic. The backend should not hide core logic inside route handlers. Instead, route handlers should validate input, call package-level services, persist run metadata, and return or stream typed responses.

The package responsibilities should look like this:

- `apps/server`: Hono routes, auth/session handling, CORS, request validation, response shaping, streaming events, and dependency wiring.
- `packages/agents`: the cloud cost copilot workflow, agent definitions, run plan, handoffs, structured outputs, and OpenAI Agents SDK integration.
- `packages/rag`: vector store ingestion and cloud cost metric/table context retrieval.
- `packages/databricks`: metadata lookup, SQL validation helpers, mock/live query execution, and Databricks SQL Warehouse access.
- `packages/evals`: Braintrust scenarios, scorers, and experiment runners.
- `packages/db`: app persistence for users, agent runs, agent steps, SQL drafts, citations, query metadata, and eval summaries.

The intended request flow is:

- [x] The frontend calls a Hono route such as `POST /api/copilot/runs` with the analyst question.
- [x] Hono validates the request with the schema exported by `packages/agents`.
- [ ] Hono creates an agent run record through `packages/db`.
- [x] Hono calls the orchestrator in `packages/agents`.
- [x] The orchestrator calls `packages/rag` to retrieve governed context and `packages/databricks` to inspect metadata or execute approved SQL.
- [x] Hono streams agent step events back to the frontend through `POST /api/copilot/runs/stream`.
- [x] Hono exposes a simple event replay endpoint at `GET /api/copilot/runs/:id/events`.
- [ ] Hono exposes persisted run detail routes for TanStack Query, such as `GET /api/copilot/runs/:id`, `GET /api/copilot/runs/:id/sql`, and `GET /api/copilot/runs/:id/results`.
- [ ] Hono exposes eval routes such as `POST /api/evals/runs` and `GET /api/evals/runs/:id`, which call `packages/evals`.

This keeps Hono focused on transport and composition while the packages remain reusable from tests, scripts, eval runners, and future background workers.

## Target Demo Experience

The first screen should be the working cloud cost copilot, not a marketing page.

An analyst asks:

> What were the top GCP cloud cost drivers in August 2024, and which services or regions explain the increase?

The app should show:

- A natural language question composer.
- A live agent run timeline.
- Retrieved metric/table documentation citations.
- Generated Databricks SQL.
- Sandbox validation status.
- Databricks execution status.
- Query results.
- Final FinOps/BI-style answer with caveats and citations.
- Related eval coverage and pass/fail status for similar scenarios.

## Agent Workflow

### Coordinator Agent

Owns the overall workflow. It interprets the user question, decides which specialist agents or tools to invoke, tracks assumptions, and composes the final answer.

### Metric Catalog/RAG Agent

Searches the OpenAI vector store for cloud cost metric definitions, glossary entries, table documentation, tagging/allocation guidance, dashboard notes, and runbooks. It should return cited context, not free-form guesses.

### Schema Agent

Uses Databricks metadata tools to discover candidate catalogs, schemas, tables, columns, join keys, and date fields. It should prefer governed or documented tables.

### SQL Analyst Agent

Generates Databricks SQL from the question, retrieved metric context, schema metadata, and known constraints. It should include the chosen metric, grain, filters, tables, and assumptions.

### SQL Safety Agent

Checks that SQL is read-only, scoped, non-destructive, and avoids sensitive columns unless explicitly allowed. It should catch DDL, DML, broad scans, missing filters, and unsupported tables.

### Sandbox Agent

Runs validation in an isolated sandbox before live Databricks execution. It should test SQL shape, sample data assumptions, and lightweight Python/SQL checks against local mock data.

### Databricks Executor Tool

Executes approved SQL against a Databricks SQL Warehouse. It should capture query text, query ID if available, runtime, row count, result metadata, and errors.

### Narrative Agent

Turns validated results into a concise BI answer with metric definitions, caveats, citations, and suggested follow-up slices.

## Agent Orchestration Plan

The next implementation step is to replace the current deterministic SQL planner with a richer OpenAI Agents SDK workflow while keeping the same public package entry point: `runCloudCostCopilot(...)`. The Hono API and frontend should not need to know whether the answer came from the deterministic fallback or the model-backed multi-agent path.

### Orchestration Shape

The workflow should use a coordinator agent with specialist agents exposed as handoffs or agent-as-tool calls. The coordinator owns the run state and final response, while specialist agents each produce structured outputs that downstream steps can validate.

Recommended run order:

1. **Coordinator Agent** receives the user question and creates a short analysis plan.
2. **Metric Catalog/RAG Agent** retrieves metric definitions, table docs, and runbook guidance.
3. **Schema Agent** checks Databricks table metadata for the target billing table.
4. **SQL Analyst Agent** drafts a single Databricks SQL query and states assumptions.
5. **SQL Safety Agent** validates the query with deterministic guards and model review.
6. **Sandbox Agent** validates the query shape against local/mock billing data before live execution.
7. **Databricks Executor Tool** runs approved SQL against Databricks if live mode is enabled.
8. **Narrative Agent** turns rows, citations, SQL, and caveats into a final FinOps answer.

The implementation should keep deterministic guardrails outside the model. A model can propose SQL, but `assertReadOnlySql(...)` and table allowlisting must still run before execution.

### Coordinator Agent

Purpose: decide what kind of cloud cost question was asked and orchestrate the specialists.

Responsibilities:

- Classify the question as spend breakdown, trend comparison, utilization analysis, anomaly/root-cause analysis, metadata lookup, or unsupported request.
- Decide whether the workflow needs RAG, schema lookup, SQL generation, Databricks execution, or clarification.
- Maintain a compact run plan for UI timeline events.
- Refuse or ask for clarification when the question lacks a metric, time window, or valid dimension.

Inputs:

- User question.
- Run mode: mock or live.
- Available table name and dataset date range.

Outputs:

- Analysis plan.
- Specialist calls/handoffs.
- Final answer assembled from specialist outputs.

Tools/handoffs:

- Metric Catalog/RAG Agent.
- Schema Agent.
- SQL Analyst Agent.
- Narrative Agent.

### Metric Catalog/RAG Agent

Purpose: ground the workflow in governed cloud cost definitions and table documentation.

Responsibilities:

- Search local markdown RAG or OpenAI vector store RAG.
- Return relevant metric definitions, table docs, runbook snippets, and caveats.
- Identify the canonical metric for spend questions: `cloud_spend_usd = SUM(rounded_cost_usd)`.
- Identify missing dataset fields that should be caveated, such as project ID, SKU, labels, amortized cost, credits, and discounts.

Inputs:

- User question.
- Optional query generated by the coordinator.

Outputs:

- Cited context snippets.
- Recommended metric IDs.
- Caveats and allowed dimensions.

Tools:

- `search_metric_context`.

### Schema Agent

Purpose: verify available Databricks fields before SQL generation.

Responsibilities:

- Call Databricks metadata methods such as `listColumns("gcp_billing_usage")`.
- Confirm the table has required fields for the question.
- Return allowed columns and recommended date/cost fields.
- Flag unsupported requests, such as project/team/tag allocation questions when labels are absent.

Inputs:

- Target table name.
- RAG context.
- User question.

Outputs:

- Table schema summary.
- Supported/unsupported field assessment.
- Suggested dimensions and filters.

Tools:

- `list_databricks_columns`.
- Later: catalog/schema/table listing once implemented.

### SQL Analyst Agent

Purpose: produce a single Databricks SQL query.

Responsibilities:

- Generate one read-only Databricks SQL query.
- Use `rounded_cost_usd` for spend unless context says otherwise.
- Use `usage_start_ts` for time filtering.
- Include safe limits for exploratory breakdowns.
- Prefer simple, explainable SQL suitable for a BI analyst.
- Return structured output with SQL, metric ID, dimensions, time window, and assumptions.

Inputs:

- User question.
- RAG context.
- Schema summary.
- Dataset date range.

Outputs:

- SQL draft.
- Metric ID.
- Time grain and date predicate.
- Assumptions.

Important constraint:

- The SQL Analyst Agent proposes SQL only. It should not execute SQL directly.

### SQL Safety Agent

Purpose: review SQL before sandbox or Databricks execution.

Responsibilities:

- Run deterministic `assertReadOnlySql(...)`.
- Enforce SELECT/WITH only.
- Block DDL, DML, multiple statements, suspicious comments, and unsupported table references.
- Confirm the query references only approved tables, initially `gcp_billing_usage`.
- Confirm a date predicate exists for broad aggregations.
- Return pass/fail plus a human-readable reason.

Inputs:

- SQL draft.
- Approved table list.
- Schema summary.

Outputs:

- Safety decision.
- Reasons.
- Optional corrected SQL suggestion.

Tools:

- Deterministic SQL safety helpers in `packages/databricks`.

### Sandbox Agent

Purpose: validate the generated SQL shape before live Databricks execution.

Responsibilities:

- Run or simulate the approved SQL against local/mock GCP billing data.
- Confirm expected output columns exist.
- Confirm the query returns rows for the intended date range.
- Catch obvious semantic errors before using the live warehouse.

Inputs:

- Safety-approved SQL.
- Local/mock billing rows.

Outputs:

- Sandbox validation result.
- Preview rows.
- Warnings about empty results or suspicious output.

Implementation note:

- For the afternoon demo, the existing local mock Databricks connector can act as the sandbox. Later, replace or augment it with an OpenAI sandbox-backed agent.

### Databricks Executor Tool

Purpose: execute only approved SQL against Databricks.

Responsibilities:

- Run read-only SQL through `packages/databricks`.
- Capture row count, query ID, elapsed time, and result rows.
- Return errors without hiding Databricks details that are useful for debugging.

Inputs:

- Safety-approved SQL.
- Live/mock mode.

Outputs:

- Query result.
- Query metadata.

### Narrative Agent

Purpose: produce the final analyst-facing answer.

Responsibilities:

- Explain the result in FinOps/BI language.
- Include the metric definition and date window.
- Mention top services/regions/resources and directional takeaways.
- Include caveats from RAG context and schema limitations.
- Keep the answer grounded in returned rows and citations.

Inputs:

- User question.
- SQL.
- Query rows.
- RAG citations.
- Safety/sandbox outcomes.

Outputs:

- Final answer.
- Follow-up questions.
- Citation list.
- Caveats.

### Structured Outputs

The agent workflow should add Zod schemas for each specialist output:

- `analysisPlanSchema`
- `retrievedContextSchema`
- `schemaAssessmentSchema`
- `sqlDraftSchema`
- `sqlSafetyResultSchema`
- `sandboxValidationResultSchema`
- `narrativeAnswerSchema`

These schemas should become the contract between agents, Hono streaming events, UI panels, and Braintrust scorers.

### Streaming Events

Each agent should emit events through the existing `onEvent` callback:

- `coordinator.started`
- `metric_catalog.completed`
- `schema_lookup.completed`
- `sql_analyst.completed`
- `sql_safety.completed`
- `sandbox_validation.completed`
- `databricks_execution.completed`
- `narrative.completed`

Each event should include a short message plus structured data where useful, such as citations, columns, SQL, validation result, query metadata, or final answer.

### Implementation Sequence

1. Add Zod schemas for specialist outputs in `packages/agents`.
2. Add Databricks metadata tool wrappers: `list_databricks_columns`, `preview_databricks_table`, and `run_read_only_databricks_sql`.
3. Split the current `createCloudCostAgentDefinitions(...)` into named specialist factory functions.
4. Update `runCloudCostCopilot(...)` to run coordinator -> RAG -> schema -> SQL -> safety -> sandbox -> Databricks -> narrative.
5. Keep deterministic SQL as fallback when `OPENAI_API_KEY` is missing or model SQL fails validation.
6. Add unit tests for each structured output parser and safety failure path.
7. Add Braintrust scenarios for table selection, SQL safety, citation grounding, and unsupported question handling.

## Chronological Implementation Plan

### 1. Define The Demo Domain

Use cloud cost analytics as the demo domain. The business story is a FinOps/BI analyst helping engineering and platform teams understand GCP spend, cost drivers, regional patterns, and utilization-related cost changes. Create 8-12 canonical questions that cover successful answers, ambiguous requests, unsupported metrics, and unsafe requests.

Recommended starting domain:

- Cloud cost analytics for a GCP environment.
- Primary metric: `cloud_spend_usd`, defined as `SUM(rounded_cost_usd)`.
- Supporting metrics: usage quantity, average CPU utilization, average memory utilization, inbound network bytes, outbound network bytes, resource count, and cost per usage quantity.
- Dimensions: service, region/zone, usage unit, resource, and date.
- Current dataset window: June 30, 2024 through September 3, 2024.
- Current dataset size: 1,000 billing usage records.

### 2. Create Demo Data And Documentation

Use the Kaggle `sairamn19/gcp-cloud-billing-data` dataset as the source data:

- [x] Download raw Kaggle archive into `data/kaggle/gcp-cloud-billing-data/raw/`.
- [x] Extract `gcp_final_approved_dataset.csv`.
- [x] Normalize the source file into `data/kaggle/gcp-cloud-billing-data/processed/gcp_billing_usage.csv`.
- [x] Generate a profile at `data/kaggle/gcp-cloud-billing-data/processed/profile.json`.
- [x] Add Databricks DDL at `data/kaggle/gcp-cloud-billing-data/schema/databricks-ddl.sql`.
- [ ] Load the processed CSV into Databricks as `bi_demo.gcp_billing_usage`.
- [ ] Add optional derived views such as `daily_cloud_spend`, `service_cost_summary`, and `regional_cost_summary`.

Create documentation files for:

- [x] Metric definitions.
- [x] Table and column descriptions.
- [ ] Approved SQL patterns.
- [x] Cost spike analysis runbook.
- [ ] Known caveats and missing billing export fields.
- [ ] FinOps answer style guidelines.

These docs become the vector store knowledge base.

### 3. Add Required Packages

Add packages that match the planned architecture:

- [x] `packages/agents`: agent definitions, tools, orchestration, structured outputs.
- [x] `packages/databricks`: Databricks SQL client, metadata access, query execution.
- [x] `packages/rag`: vector store ingestion, file upload manifests, retrieval helpers.
- [x] `packages/evals`: Braintrust eval datasets, task runner, scorers, CLI scripts.
- [ ] `packages/shared` if cross-package schemas outgrow the current app structure.

Keep package boundaries small and practical. Shared Zod schemas can live in `packages/agents` or a dedicated shared package when they are used by both web and server.

### 4. Extend Environment Configuration

Add typed environment variables for:

- [x] `OPENAI_API_KEY`
- [x] `OPENAI_VECTOR_STORE_ID`
- [x] `BRAINTRUST_API_KEY`
- [x] `BRAINTRUST_PROJECT_NAME`
- [x] `DATABRICKS_SERVER_HOSTNAME`
- [x] `DATABRICKS_HTTP_PATH`
- [x] `DATABRICKS_TOKEN` or OAuth credentials
- [x] `DATABRICKS_CATALOG`
- [x] `DATABRICKS_SCHEMA`
- [x] Feature flags such as `ENABLE_DATABRICKS_EXECUTION` and `USE_MOCK_DATABRICKS`
- [x] `apps/server/.env.example`
- [x] `apps/web/.env.example`

The app should be able to run in mock mode without Databricks credentials.

### 5. Implement Databricks Connectivity

Build a small Databricks client wrapper with methods for:

- [x] Health check.
- [ ] List catalogs/schemas/tables.
- [x] Get columns and table comments.
- [x] Run read-only SQL.
- [x] Run limited preview queries.
- [x] Capture execution metadata.

- [x] Add a mock Databricks adapter with the same interface so the demo and tests can run locally.
- [x] Add `bun run databricks:check` to verify credentials, table metadata, and preview rows after the data is uploaded.

For this dataset, the first live Databricks target is:

```txt
bi_demo.gcp_billing_usage
```

Use `data/kaggle/gcp-cloud-billing-data/schema/databricks-ddl.sql` to create the table. Upload `data/kaggle/gcp-cloud-billing-data/processed/gcp_billing_usage.csv` to a Databricks volume or external location, then run the `COPY INTO` pattern from the DDL file.

### 6. Build Vector Store Ingestion

Create an ingestion script that:

- [x] Reads docs from a local knowledge-base directory.
- [x] Provides a RAG interface with both local and OpenAI vector-store implementations.
- [x] Searches an existing OpenAI vector store by `OPENAI_VECTOR_STORE_ID`.
- [x] Uploads docs to OpenAI.
- [x] Creates or updates a vector store.
- [x] Persists the vector store ID in a generated manifest.
- [x] Writes an ingestion manifest with filenames, file IDs, timestamps, and checksums.
- [ ] Automatically update `apps/server/.env` with the generated vector store ID.

Use the vector store in the Metric Catalog/RAG Agent.

### 7. Build The First End-To-End Agent Slice

Implement the simplest useful workflow:

- [x] User asks a cloud cost metric question.
- [x] Coordinator creates a run plan.
- [x] RAG retrieves metric/table/runbook context.
- [x] SQL analyst scaffold drafts SQL for first cost questions.
- [x] Read-only SQL guard validates the generated query.
- [x] Databricks connector executes the approved query.
- [x] Narrative scaffold returns a proposed answer and citations.
- [x] Add opt-in model-backed SQL generation through the OpenAI Agents SDK.
- [x] Add streaming step events for Hono/UI.
- [x] Add structured output schemas for each specialist agent.
- [x] Split agent definitions into coordinator, RAG, schema, SQL, safety, sandbox, executor, and narrative factories.
- [x] Add schema lookup, SQL safety, sandbox validation, and narrative contracts to the run path.
- [ ] Add model-backed structured output generation for every specialist, beyond coordinator, SQL draft, and narrative.

At this stage, the first slice is exposed through Hono. It can run with a deterministic SQL fallback or opt into model-backed SQL generation when `OPENAI_API_KEY` is configured.

Recommended first questions:

- What were the top GCP services by cloud spend in August 2024?
- Which regions had the highest cloud spend?
- Which services had the highest average CPU utilization?
- Which services had high cost but low CPU utilization?
- What changed between July 2024 and August 2024?
- Which resources contributed most to total cloud spend?

### 8. Add SQL Safety And Sandbox Validation

Add deterministic SQL safety checks before the sandbox:

- SELECT-only enforcement.
- No DDL/DML statements.
- Approved table allowlist.
- Required date filters for large facts.
- Sensitive column denylist.
- Optional row limit for previews.

Then add the sandbox agent to validate SQL against local mock data. The workflow should not call Databricks until deterministic checks and sandbox validation both pass.

Current implementation status:

- [x] Deterministic SQL safety validates SELECT/WITH-only SQL.
- [x] Approved table allowlisting runs before execution.
- [x] Sandbox validation runs against local/mock billing data before Databricks execution when a sandbox connector is configured.
- [ ] Add model-backed SQL safety review as a second opinion after deterministic checks.

### 9. Add Live Databricks Execution

Allow approved queries to execute against Databricks when `ENABLE_DATABRICKS_EXECUTION=true`.

The final answer should clearly distinguish:

- Documentation-only answer.
- Locally validated answer.
- Live Databricks-executed answer.

Store run metadata and query results summaries in the app database.

### 10. Build Backend API Routes

Add Hono routes for:

- [x] Create agent run.
- [x] Stream agent run events.
- [ ] Get persisted run details.
- [ ] List persisted run history.
- [ ] Get generated SQL and validation reports from persistence.
- [ ] Get result summaries from persistence.
- [ ] Trigger vector store ingestion through the API.
- [ ] Trigger eval runs.
- [ ] List eval results.

Prefer typed request/response schemas and keep route handlers thin.

### 11. Build The BI Copilot UI

Replace the scaffold home/dashboard with a compact internal BI workbench:

- Question composer.
- Run timeline.
- SQL tab.
- Results tab.
- Citations tab.
- Validation tab.
- Trace/eval metadata panel.

Use TanStack Query for normal reads/mutations and a streaming channel for live run events.

### 12. Add Braintrust Evals

Braintrust setup for this demo:

- Create a Braintrust project named `openai-demo-bi-metrics-copilot`.
- Create a Braintrust API key in user settings and set `BRAINTRUST_API_KEY` in `apps/server/.env`.
- Set `BRAINTRUST_PROJECT_NAME=openai-demo-bi-metrics-copilot`.
- Configure OpenAI as an AI provider in Braintrust if using Braintrust-hosted LLM-as-judge scorers or the Braintrust gateway.
- Keep `OPENAI_API_KEY` in `apps/server/.env` for this app's OpenAI Agents SDK and vector store calls.

Create curated eval scenarios covering:

- Correct cloud cost metric selection.
- Correct table selection.
- Correct date grain and filters.
- Safe Databricks SQL generation.
- Sandbox-before-Databricks behavior.
- Citation grounding.
- Ambiguous question clarification.
- Unsafe request refusal.
- Unsupported metric handling.

Implement scorers:

- Code scorer for expected metric ID.
- Code scorer for required table names.
- Code scorer for SELECT-only SQL.
- Code scorer for sandbox step presence.
- LLM-as-judge scorer for final answer quality.
- LLM-as-judge scorer for citation usefulness and caveat quality.

Run evals locally and in CI.

### 13. Add Tests

Use Vitest for:

- [x] SQL safety checks.
- [x] Databricks adapter interface behavior.
- [x] Mock Databricks execution.
- [ ] Vector store ingestion manifest logic.
- [x] Agent structured output parsing.
- [x] Braintrust scenario loading and scorer helpers.
- [ ] API route schema validation.

Keep agent behavior tests in Braintrust and deterministic code behavior tests in Vitest.

### 14. Add Observability And Run History

Persist:

- User question.
- Agent steps.
- Tool calls.
- SQL drafts.
- Validation results.
- Databricks query metadata.
- Final answer.
- Citation references.
- OpenAI trace IDs.
- Braintrust experiment IDs.

Expose these in the UI so the demo can show how an answer was produced.

### 15. Harden And Polish

Add:

- Timeouts.
- Error boundaries.
- Retry strategy for transient Databricks/OpenAI failures.
- Mock-mode banners.
- Seed/reset scripts.
- Example env files.
- CI commands.
- A short demo script with three flows: successful answer, clarification request, and unsafe SQL caught before execution.

## Suggested Demo Milestones

### Milestone 1: Scaffold Alignment

- [x] Confirm the monorepo type-checks and tests run.
- [x] Add project docs.
- [x] Add missing env examples and typed env keys.
- [x] Add package boundaries for agents, Databricks, RAG, and evals.

### Milestone 2: Cloud Billing Data Foundation

- [x] Select Kaggle `GCP-Cloud-Billing-Data` as the canonical demo dataset.
- [x] Download and extract the raw dataset.
- [x] Normalize the dataset into a Databricks-ready CSV.
- [x] Generate a dataset profile.
- [x] Add Databricks table DDL.
- [x] Add initial cloud cost knowledge docs.
- [ ] Load the processed CSV into Databricks.
- [ ] Create optional summary views for daily, service, and regional cost.

### Milestone 3: Mock Copilot

- [x] Run an end-to-end agent workflow using local docs and mock cloud billing data only.
- [x] Expose the workflow through Hono.
- [ ] Render the workflow in the frontend.

### Milestone 4: RAG And Sandbox

- [x] Add an OpenAI vector-store search connector.
- [x] Add a script to ingest docs into OpenAI vector stores.
- [ ] Run vector store ingestion with a real `OPENAI_API_KEY`.
- [x] Add Schema Agent metadata lookup.
- [x] Add SQL Safety Agent output schema.
- [x] Validate generated SQL through deterministic checks plus sandbox agent execution.
- [ ] Add model-backed SQL Safety Agent review.

### Milestone 5: Databricks Live Mode

- [x] Connect to Databricks SQL Warehouse.
- [x] Execute approved queries.
- [ ] Render results in the UI.

### Milestone 6: Braintrust Evaluation

- [ ] Run curated scenarios through Braintrust.
- [ ] Show regression scores for the full workflow.

### Milestone 7: Demo Polish

- [ ] Refine the UI.
- [ ] Add trace/run details.
- [ ] Document setup.
- [ ] Prepare the final demo flow.

## Notes On Technology Fit

The current stack is a good fit. Hono is a sensible backend for a TypeScript agent API, TanStack Start works well for the frontend, and Drizzle/libSQL is enough for app metadata. The main caution is runtime compatibility: Bun should remain the package manager and local script runner, but the backend should stay Node-compatible in case Databricks or sandbox-related dependencies require Node behavior.

Braintrust replaces the OpenAI Evals API because OpenAI has announced deprecation of the Evals platform. Braintrust is better suited for this demo's long-term evaluation layer while preserving the rest of the OpenAI-centered architecture.
