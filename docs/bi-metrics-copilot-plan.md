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
- [ ] Real OpenAI Agents SDK implementation in `packages/agents`.
- [x] Real Databricks SQL driver implementation in `packages/databricks`.
- [ ] Real OpenAI vector store/file search implementation in `packages/rag`.
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

1. The frontend calls a Hono route such as `POST /api/copilot/runs` with the analyst question.
2. Hono validates the request with the schema exported by `packages/agents`.
3. Hono creates an agent run record through `packages/db`.
4. Hono calls the orchestrator in `packages/agents`.
5. The orchestrator calls `packages/rag` to retrieve governed context and `packages/databricks` to inspect metadata or execute approved SQL.
6. Hono streams agent step events back to the frontend through an event stream route such as `GET /api/copilot/runs/:id/events`.
7. Hono exposes run detail routes for TanStack Query, such as `GET /api/copilot/runs/:id`, `GET /api/copilot/runs/:id/sql`, and `GET /api/copilot/runs/:id/results`.
8. Hono exposes eval routes such as `POST /api/evals/runs` and `GET /api/evals/runs/:id`, which call `packages/evals`.

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

- Reads docs from a local knowledge-base directory.
- Uploads docs to OpenAI.
- Creates or updates a vector store.
- Persists the vector store ID.
- Writes an ingestion manifest with filenames, file IDs, timestamps, and checksums.

Use the vector store in the Metric Catalog/RAG Agent.

### 7. Build The First End-To-End Agent Slice

Implement the simplest useful workflow:

1. User asks a cloud cost metric question.
2. Coordinator calls the Metric Catalog/RAG Agent.
3. SQL Analyst drafts SQL.
4. Narrative Agent returns a proposed answer and assumptions.

At this stage, skip live Databricks execution and focus on agent handoffs, structured outputs, and traceability.

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

### 9. Add Live Databricks Execution

Allow approved queries to execute against Databricks when `ENABLE_DATABRICKS_EXECUTION=true`.

The final answer should clearly distinguish:

- Documentation-only answer.
- Locally validated answer.
- Live Databricks-executed answer.

Store run metadata and query results summaries in the app database.

### 10. Build Backend API Routes

Add Hono routes for:

- Create agent run.
- Stream agent run events.
- Get run details.
- List run history.
- Get generated SQL and validation reports.
- Get result summaries.
- Trigger vector store ingestion.
- Trigger eval runs.
- List eval results.

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

- [ ] Run an end-to-end agent workflow using local docs and mock cloud billing data only.

### Milestone 4: RAG And Sandbox

- [ ] Ingest docs into OpenAI vector stores.
- [ ] Validate generated SQL through deterministic checks plus sandbox agent execution.

### Milestone 5: Databricks Live Mode

- [ ] Connect to Databricks SQL Warehouse.
- [ ] Execute approved queries.
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
