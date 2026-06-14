# BI Metrics Copilot For Databricks

## Project Goal

Build a BI Metrics Copilot that lets an analyst ask governed metric questions in natural language, retrieves metric and table context from a RAG knowledge base, generates Databricks SQL, validates the query through safety checks and a sandbox agent, optionally executes against Databricks, and returns a cited BI-style answer with traceable reasoning and evaluation results.

The project should demonstrate:

- OpenAI Agents SDK multi-agent orchestration.
- An OpenAI sandbox agent for SQL/Python validation before live execution.
- OpenAI vector stores/file search for RAG over metric definitions, table docs, dashboard notes, and BI runbooks.
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
- Demo seed tables for revenue, customer, product, usage, and date dimensions.
- Local mock data for offline sandbox validation.

### Persistence And Tooling

- Drizzle ORM with SQLite/libSQL for app metadata, auth, run history, eval results, and cached catalog metadata.
- Turborepo for monorepo task orchestration.
- Vitest for unit and integration tests.
- oxlint and oxfmt for linting and formatting.
- Docker Compose for local web/server packaging.

## Current Scaffold Alignment

The current repository already aligns with several planned technologies:

- Bun workspaces are configured at the root.
- Turborepo is configured for build, dev, type-checking, and database tasks.
- `apps/web` uses TanStack Start, React, TanStack Router, TanStack Query, Vite, Tailwind CSS, and shared UI components.
- `apps/server` uses Hono and exposes a basic health route plus Better Auth endpoints.
- `packages/db` uses Drizzle with SQLite/libSQL.
- `packages/auth` uses Better Auth.
- `packages/env` uses typed environment validation.
- oxlint and oxfmt are installed and exposed through `bun run check`.

Major planned pieces still to add:

- `packages/agents` for OpenAI Agents SDK orchestration.
- `packages/databricks` for SQL Warehouse and metadata access.
- `packages/rag` or similar for vector store ingestion and retrieval helpers.
- `packages/evals` for Braintrust datasets, eval runners, and scorers.
- Agent run persistence tables in `packages/db`.
- Databricks, OpenAI, and Braintrust environment variables in `packages/env`.
- Vitest setup and test scripts across packages.
- UI routes for the copilot workspace, run details, SQL/results tabs, citation panel, and eval dashboard.
- Streaming API endpoints for agent run progress.

## Target Demo Experience

The first screen should be the working BI copilot, not a marketing page.

An analyst asks:

> What was weekly revenue by customer segment last quarter, and why did Enterprise dip in March?

The app should show:

- A natural language question composer.
- A live agent run timeline.
- Retrieved metric/table documentation citations.
- Generated Databricks SQL.
- Sandbox validation status.
- Databricks execution status.
- Query results.
- Final BI-style answer with caveats and citations.
- Related eval coverage and pass/fail status for similar scenarios.

## Agent Workflow

### Coordinator Agent

Owns the overall workflow. It interprets the user question, decides which specialist agents or tools to invoke, tracks assumptions, and composes the final answer.

### Metric Catalog/RAG Agent

Searches the OpenAI vector store for metric definitions, glossary entries, table documentation, dashboard notes, and runbooks. It should return cited context, not free-form guesses.

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

Choose a realistic BI domain such as revenue analytics, customer retention, product usage, or sales pipeline. Define the business story, stakeholders, and the metrics the demo should answer. Create 8-12 canonical questions that cover successful answers, ambiguous requests, unsupported metrics, and unsafe requests.

Recommended starting domain:

- Revenue analytics for a SaaS-style business.
- Metrics: revenue, net revenue retention, active customers, average revenue per account, churned revenue, expansion revenue.
- Dimensions: customer segment, product, region, date, channel.

### 2. Create Demo Data And Documentation

Create a small but realistic data model:

- `fact_orders` or `fact_revenue`
- `fact_usage`
- `dim_customer`
- `dim_product`
- `dim_date`
- Optional `dim_region`

Create documentation files for:

- Metric definitions.
- Table and column descriptions.
- Approved join paths.
- Dashboard notes.
- Known caveats.
- BI style and answer guidelines.

These docs become the vector store knowledge base.

### 3. Add Required Packages

Add packages that match the planned architecture:

- `packages/agents`: agent definitions, tools, orchestration, structured outputs.
- `packages/databricks`: Databricks SQL client, metadata access, query execution.
- `packages/rag`: vector store ingestion, file upload manifests, retrieval helpers.
- `packages/evals`: Braintrust eval datasets, task runner, scorers, CLI scripts.
- `packages/shared` if cross-package schemas outgrow the current app structure.

Keep package boundaries small and practical. Shared Zod schemas can live in `packages/agents` or a dedicated shared package when they are used by both web and server.

### 4. Extend Environment Configuration

Add typed environment variables for:

- `OPENAI_API_KEY`
- `OPENAI_VECTOR_STORE_ID`
- `BRAINTRUST_API_KEY`
- `BRAINTRUST_PROJECT_NAME`
- `DATABRICKS_SERVER_HOSTNAME`
- `DATABRICKS_HTTP_PATH`
- `DATABRICKS_TOKEN` or OAuth credentials
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`
- Feature flags such as `ENABLE_DATABRICKS_EXECUTION` and `USE_MOCK_DATABRICKS`

The app should be able to run in mock mode without Databricks credentials.

### 5. Implement Databricks Connectivity

Build a small Databricks client wrapper with methods for:

- Health check.
- List catalogs/schemas/tables.
- Get columns and table comments.
- Run read-only SQL.
- Run limited preview queries.
- Capture execution metadata.

Add a mock Databricks adapter with the same interface so the demo and tests can run locally.

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

1. User asks a metric question.
2. Coordinator calls the Metric Catalog/RAG Agent.
3. SQL Analyst drafts SQL.
4. Narrative Agent returns a proposed answer and assumptions.

At this stage, skip live Databricks execution and focus on agent handoffs, structured outputs, and traceability.

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

- Correct metric selection.
- Correct table selection.
- Correct date grain and filters.
- Safe SQL generation.
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

- SQL safety checks.
- Databricks adapter interface behavior.
- Mock Databricks execution.
- Vector store ingestion manifest logic.
- Agent structured output parsing.
- Braintrust scenario loading and scorer helpers.
- API route schema validation.

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

Confirm the monorepo builds, type-checks, and runs. Add project docs, missing env keys, and package boundaries.

### Milestone 2: Mock Copilot

Run an end-to-end agent workflow using local docs and mock data only.

### Milestone 3: RAG And Sandbox

Ingest docs into OpenAI vector stores and validate generated SQL through deterministic checks plus sandbox agent execution.

### Milestone 4: Databricks Live Mode

Connect to Databricks SQL Warehouse, execute approved queries, and render results in the UI.

### Milestone 5: Braintrust Evaluation

Run curated scenarios through Braintrust and show regression scores for the full workflow.

### Milestone 6: Demo Polish

Refine the UI, add trace/run details, document setup, and prepare the final demo flow.

## Notes On Technology Fit

The current stack is a good fit. Hono is a sensible backend for a TypeScript agent API, TanStack Start works well for the frontend, and Drizzle/libSQL is enough for app metadata. The main caution is runtime compatibility: Bun should remain the package manager and local script runner, but the backend should stay Node-compatible in case Databricks or sandbox-related dependencies require Node behavior.

Braintrust replaces the OpenAI Evals API because OpenAI has announced deprecation of the Evals platform. Braintrust is better suited for this demo's long-term evaluation layer while preserving the rest of the OpenAI-centered architecture.
