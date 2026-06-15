import type { DatabricksConnector } from "@openai-demo/databricks";
import type { RagConnector, RetrievedContext } from "@openai-demo/rag";

import {
  type RetrievedContextResult,
  type SchemaAssessment,
  retrievedContextSchema,
  schemaAssessmentSchema,
} from "./schemas";
import { unqualifiedTableName } from "./sql";

export async function retrieveMetricContext(
  question: string,
  rag: RagConnector,
): Promise<RetrievedContextResult> {
  const citations = await rag.search(question, { limit: 4 });

  return retrievedContextSchema.parse({
    citations,
    caveats: inferKnowledgeCaveats(citations),
  });
}

export async function assessDatabricksSchema(
  tableName: string,
  question: string,
  databricks: DatabricksConnector,
): Promise<SchemaAssessment> {
  const columns = await listColumnsWithFallback(tableName, databricks);
  const columnNames = new Set(columns.map((column) => column.columnName));
  const unsupportedFields = [];
  const warnings = [];

  for (const field of ["project_id", "sku_id", "labels", "credits", "discounts"]) {
    if (question.toLowerCase().includes(field.replace("_", " ")) && !columnNames.has(field)) {
      unsupportedFields.push(field);
    }
  }

  if (!columnNames.has("rounded_cost_usd")) {
    warnings.push("Expected rounded_cost_usd is missing; spend SQL may need a different metric.");
  }

  return schemaAssessmentSchema.parse({
    tableName,
    columns: columns.map((column) => ({
      columnName: column.columnName,
      dataType: column.dataType,
      comment: column.comment,
    })),
    supportedDimensions: ["service_name", "region_zone"].filter((column) =>
      columnNames.has(column),
    ),
    unsupportedFields,
    warnings,
  });
}

function inferKnowledgeCaveats(citations: RetrievedContext[]): string[] {
  const caveats = new Set<string>();
  const content = citations.map((citation) => citation.excerpt.toLowerCase()).join("\n");

  for (const field of ["project id", "sku", "labels", "credits", "discounts", "amortized cost"]) {
    if (content.includes(field)) {
      caveats.add(`Retrieved docs mention ${field}; verify whether this demo dataset includes it.`);
    }
  }

  return [...caveats];
}

async function listColumnsWithFallback(tableName: string, databricks: DatabricksConnector) {
  const columns = await databricks.listColumns(tableName);

  if (columns.length > 0 || !tableName.includes(".")) {
    return columns;
  }

  return databricks.listColumns(unqualifiedTableName(tableName));
}
