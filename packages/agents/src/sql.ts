import { assertReadOnlySql } from "@openai-demo/databricks";

import {
  type SchemaAssessment,
  type SqlDraft,
  type SqlSafetyResult,
  sqlDraftSchema,
  sqlSafetyResultSchema,
} from "./schemas";

export function buildDeterministicSqlDraft(question: string, tableName: string): SqlDraft {
  const normalized = question.toLowerCase();
  const datePredicate =
    "usage_start_ts >= TIMESTAMP '2024-08-01' AND usage_start_ts < TIMESTAMP '2024-09-01'";

  if (normalized.includes("region")) {
    return sqlDraftSchema.parse({
      sql: `
      SELECT
        region_zone,
        SUM(rounded_cost_usd) AS cloud_spend_usd
      FROM ${tableName}
      WHERE ${datePredicate}
      GROUP BY region_zone
      ORDER BY cloud_spend_usd DESC
      LIMIT 10
    `,
      dimensions: ["region_zone"],
      assumptions: ["Defaulted to August 2024 because no other date window was requested."],
    });
  }

  if (normalized.includes("cpu") || normalized.includes("utilization")) {
    return sqlDraftSchema.parse({
      sql: `
      SELECT
        service_name,
        SUM(rounded_cost_usd) AS cloud_spend_usd,
        AVG(cpu_utilization_pct) AS avg_cpu_utilization_pct,
        AVG(memory_utilization_pct) AS avg_memory_utilization_pct
      FROM ${tableName}
      WHERE ${datePredicate}
      GROUP BY service_name
      ORDER BY cloud_spend_usd DESC
      LIMIT 10
    `,
      dimensions: ["service_name"],
      assumptions: ["Defaulted to August 2024 because no other date window was requested."],
    });
  }

  return sqlDraftSchema.parse({
    sql: `
    SELECT
      service_name,
      SUM(rounded_cost_usd) AS cloud_spend_usd
    FROM ${tableName}
    WHERE ${datePredicate}
    GROUP BY service_name
    ORDER BY cloud_spend_usd DESC
    LIMIT 10
  `,
    dimensions: ["service_name"],
    assumptions: ["Defaulted to August 2024 because no other date window was requested."],
  });
}

export function extractSql(output: string): string {
  const codeBlockMatch = /```(?:sql)?\s*([\s\S]*?)```/iu.exec(output);
  const candidate = codeBlockMatch?.[1] ?? output;
  const statementMatch = /\b(?:select|with)\b[\s\S]*/iu.exec(candidate);
  const statement = statementMatch?.[0] ?? candidate;

  return normalizeSingleSqlStatement(statement);
}

export function normalizeSingleSqlStatement(sql: string): string {
  return sql
    .trim()
    .replace(/^```sql\s*/iu, "")
    .replace(/^```\s*/u, "")
    .replace(/```$/u, "")
    .trim()
    .replace(/;\s*$/u, "")
    .trim();
}

export function validateSqlDraft(
  sql: string,
  tableName: string,
  schemaAssessment: SchemaAssessment,
): SqlSafetyResult {
  const normalizedSql = normalizeSingleSqlStatement(sql);
  const reasons = [];

  try {
    assertReadOnlySql(normalizedSql);
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : "SQL failed read-only validation.");
  }

  if (!referencesApprovedTable(normalizedSql, tableName)) {
    reasons.push(`SQL must reference only the approved table: ${tableName}.`);
  }

  if (!/\busage_start_ts\b/iu.test(normalizedSql)) {
    reasons.push("SQL must include a usage_start_ts date predicate.");
  }

  if (
    schemaAssessment.supportedDimensions.length > 0 &&
    !schemaAssessment.columns.some((column) => normalizedSql.includes(column.columnName))
  ) {
    reasons.push("SQL does not reference any known billing table columns.");
  }

  return sqlSafetyResultSchema.parse({
    passed: reasons.length === 0,
    reasons,
    approvedTables: [tableName],
  });
}

export function unqualifiedTableName(tableName: string): string {
  return normalizeTableReference(tableName).split(".").at(-1) ?? tableName;
}

function referencesApprovedTable(sql: string, tableName: string): boolean {
  const approved = new Set([normalizeTableReference(tableName), unqualifiedTableName(tableName)]);
  const referencedTables = [...sql.matchAll(/\b(?:from|join)\s+([`"A-Za-z0-9_.]+)/giu)].map(
    (match) => normalizeTableReference(match[1] ?? ""),
  );

  return referencedTables.length > 0 && referencedTables.every((table) => approved.has(table));
}

function normalizeTableReference(tableName: string): string {
  return tableName.replaceAll(/[`"]/gu, "").trim().toLowerCase();
}
