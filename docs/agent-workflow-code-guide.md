# Agent Workflow Code Guide

This guide explains the main code paths in the `packages/agents` package for the Cloud Cost Metrics Copilot.

## File Map

- `packages/agents/src/index.ts`: Main orchestration and OpenAI Agents SDK agent definitions.
- `packages/agents/src/schemas.ts`: Zod schemas and TypeScript types for agent inputs, outputs, run events, and final results.
- `packages/agents/src/context.ts`: RAG retrieval and Databricks schema assessment helpers.
- `packages/agents/src/sql.ts`: Deterministic SQL generation, SQL extraction, table allowlisting, and SQL safety validation.
- `packages/agents/src/sandbox.ts`: Sandbox validation before live Databricks execution.
- `packages/agents/src/index.test.ts`: Vitest coverage for the agent workflow contracts and mocked run path.

## Main Orchestration

### `runCloudCostCopilot(input, dependencies)`

This is the main workflow entry point used by the Hono API.

It runs the full agentic sequence:

1. Create an initial run plan.
2. Classify the question with the coordinator step.
3. Retrieve metric/table/runbook context from RAG.
4. Inspect Databricks schema metadata.
5. Generate a SQL draft.
6. Validate SQL safety with deterministic checks.
7. Validate SQL against sandbox/mock data.
8. Execute approved SQL against the configured Databricks connector.
9. Build the final narrative answer.

It emits events through `dependencies.onEvent`, which lets the server stream timeline updates to the UI.

### `createInitialRunPlan(input)`

Creates the ordered list of expected workflow steps. The UI can use this to show the run timeline before every step has completed.

### `describeAgentStep(name)`

Maps each internal step name to a human-readable description.

## Agent Definitions

### `createCloudCostAgentDefinitions(dependencies)`

Builds all OpenAI Agents SDK agent definitions and tools for the workflow.

It returns:

- `coordinatorAgent`
- `metricCatalogAgent`
- `schemaAgent`
- `sqlAnalystAgent`
- `sqlSafetyAgent`
- `sandboxAgent`
- `databricksExecutorAgent`
- `narrativeAgent`
- `tools`

These definitions are useful for model-backed runs, tests, and future Braintrust trace/eval visibility.

### `createCloudCostTools(dependencies)`

Wraps package dependencies as model-callable tools:

- `search_metric_context`: searches the RAG connector.
- `list_databricks_columns`: lists Databricks table columns.
- `preview_databricks_table`: previews Databricks table rows.
- `run_read_only_databricks_sql`: executes approved read-only SQL.

### Specialist Agent Factories

The following functions each create one specialist agent:

- `createCoordinatorAgent`
- `createMetricCatalogAgent`
- `createSchemaAgent`
- `createSqlAnalystAgent`
- `createSqlSafetyAgent`
- `createSandboxAgent`
- `createDatabricksExecutorAgent`
- `createNarrativeAgent`

Each specialist owns a narrow responsibility and, when relevant, has an `outputType` from `schemas.ts`.

## Model-Backed Helpers In `index.ts`

### `buildModelBackedAnalysisPlan(...)`

Runs the coordinator agent to classify the question and produce a structured `AnalysisPlan`.

If the model output is missing or invalid, the workflow falls back to deterministic classification.

### `buildModelBackedCloudCostSql(...)`

Runs the SQL analyst agent to produce a structured SQL draft.

The prompt includes:

- user question
- target table name
- available columns from schema lookup
- retrieved RAG context
- default August 2024 time window instruction
- `rounded_cost_usd` metric instruction

The returned SQL still goes through deterministic safety checks before sandbox or Databricks execution.

### `buildModelBackedNarrative(...)`

Runs the narrative agent to turn rows, SQL, citations, safety status, and sandbox status into an analyst-facing answer.

If no valid model output is produced, it falls back to deterministic narrative generation.

### `buildDeterministicAnalysisPlan(...)`

Lightweight fallback classifier. It currently recognizes:

- region questions
- CPU/utilization questions
- default service spend breakdown questions

This keeps the demo working even without an OpenAI API key.

### `buildDeterministicNarrative(...)`

Creates a simple final answer from the Databricks rows and citations. It also includes caveats from schema assessment.

## Schemas

`schemas.ts` is the contract layer. The most important schemas are:

- `copilotQuestionSchema`: validates API input.
- `cloudCostCopilotResultSchema`: validates the final response.
- `analysisPlanSchema`: coordinator output.
- `retrievedContextSchema`: RAG output.
- `schemaAssessmentSchema`: schema lookup output.
- `sqlDraftSchema`: SQL analyst output.
- `sqlSafetyResultSchema`: SQL safety output.
- `sandboxValidationResultSchema`: sandbox output.
- `narrativeAnswerSchema`: narrative output.

These schemas should also become useful for Braintrust scorers and UI panels.

## Supporting Modules

### `context.ts`

`retrieveMetricContext(question, rag)` searches the configured RAG connector and normalizes citations/caveats.

`assessDatabricksSchema(tableName, question, databricks)` lists table columns and identifies supported dimensions or missing requested fields.

### `sql.ts`

`buildDeterministicSqlDraft(question, tableName)` creates fallback SQL for supported demo questions.

`validateSqlDraft(sql, tableName, schemaAssessment)` enforces important guardrails:

- read-only SQL
- approved table references
- required `usage_start_ts` predicate
- references to known billing columns

### `sandbox.ts`

`validateInSandbox(sql, input, dependencies)` runs SQL against the sandbox connector before live execution.

For live mode, the server wires this to local CSV-backed billing data so the workflow can catch obvious issues before touching Databricks.

## Mental Model

Think of `index.ts` as the conductor:

- It decides the order of work.
- It emits events.
- It invokes specialist agents and helper modules.
- It refuses to execute SQL until safety and sandbox checks pass.

Think of the other files as contracts and instruments:

- `schemas.ts` defines what every step must return.
- `context.ts` gathers knowledge and schema context.
- `sql.ts` drafts and validates SQL.
- `sandbox.ts` protects live execution.
