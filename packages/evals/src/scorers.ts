import type { EvalScorer } from "braintrust";

import type { EvalExpected, EvalInput, EvalOutput, EvalScore, LocalEvalCase } from "./schemas";

type CloudCostScorer = EvalScorer<EvalInput, EvalOutput, EvalExpected, LocalEvalCase["metadata"]>;

export const metricSelection: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(scoreMetric(expected.metricId, output.metricId));

export const requiredTables: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(scoreRequiredTables(expected.requiredTables, output.usedTables));

export const requiredSqlFragments: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(scoreRequiredSqlFragments(expected.requiredSqlFragments, output.sql));

export const sqlSafety: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(scoreSqlSafety(expected.forbiddenSqlFragments, output.sql));

export const dateFilter: CloudCostScorer = ({ output }) =>
  toBraintrustScore(scoreBoolean("date_filter", true, /\busage_start_ts\b/iu.test(output.sql)));

export const sandboxUsed: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(scoreBoolean("sandbox_used", expected.shouldUseSandbox, output.usedSandbox));

export const liveDatabricksUsage: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(
    scoreBoolean(
      "live_databricks_execution",
      expected.shouldExecuteLiveDatabricks,
      output.executedLiveDatabricks,
    ),
  );

export const citationGrounding: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(
    scoreBoolean("citation_grounding", expected.shouldHaveCitations, output.citations.length > 0),
  );

export const answerQuality: CloudCostScorer = ({ output, expected }) => {
  const hasAnswer = output.answer.trim().length > 0;
  const hasRows = output.rows.length >= expected.minimumRows;
  const mentionsResult = /returned|top result|cloud spend|spend|rows/iu.test(output.answer);

  return toBraintrustScore({
    name: "answer_quality",
    score: hasAnswer && hasRows && mentionsResult ? 1 : 0,
    reason:
      hasAnswer && hasRows && mentionsResult
        ? "Answer is non-empty, row-backed, and describes the result."
        : "Answer should be non-empty, row-backed, and describe the result.",
  });
};

export const answerExpectedFacts: CloudCostScorer = ({ output, expected }) =>
  toBraintrustScore(
    scoreExpectedAnswerTerms(
      expected.expectedAnswerTerms,
      expected.minimumAnswerTermMatches,
      output.answer,
    ),
  );

export function scoreScenario(expected: EvalExpected, output: EvalOutput): EvalScore[] {
  return [
    scoreMetric(expected.metricId, output.metricId),
    scoreRequiredTables(expected.requiredTables, output.usedTables),
    scoreRequiredSqlFragments(expected.requiredSqlFragments, output.sql),
    scoreSqlSafety(expected.forbiddenSqlFragments, output.sql),
    scoreBoolean("date_filter", true, /\busage_start_ts\b/iu.test(output.sql)),
    scoreBoolean("sandbox_used", expected.shouldUseSandbox, output.usedSandbox),
    scoreBoolean(
      "live_databricks_execution",
      expected.shouldExecuteLiveDatabricks,
      output.executedLiveDatabricks,
    ),
    scoreBoolean("citation_grounding", expected.shouldHaveCitations, output.citations.length > 0),
    scoreExpectedAnswerTerms(
      expected.expectedAnswerTerms,
      expected.minimumAnswerTermMatches,
      output.answer,
    ),
  ];
}

function scoreMetric(expectedMetricId: string, actualMetricId: string | undefined): EvalScore {
  const passed = expectedMetricId === actualMetricId;

  return {
    name: "metric_selection",
    score: passed ? 1 : 0,
    reason: passed
      ? `Selected expected metric ${expectedMetricId}.`
      : `Expected metric ${expectedMetricId}, got ${actualMetricId ?? "none"}.`,
  };
}

function scoreRequiredTables(requiredTables: string[], usedTables: string[]): EvalScore {
  const normalizedUsedTables = usedTables.map(normalizeTableReference);
  const missing = requiredTables.filter((table) => !tableWasUsed(table, normalizedUsedTables));

  return {
    name: "required_tables",
    score: missing.length === 0 ? 1 : 0,
    reason:
      missing.length === 0
        ? "All required tables were used."
        : `Missing required tables: ${missing.join(", ")}.`,
  };
}

function scoreRequiredSqlFragments(requiredFragments: string[], sql: string): EvalScore {
  const normalizedSql = sql.toLowerCase();
  const missing = requiredFragments.filter(
    (fragment) => !normalizedSql.includes(fragment.toLowerCase()),
  );

  return {
    name: "required_sql_fragments",
    score: missing.length === 0 ? 1 : 0,
    reason:
      missing.length === 0
        ? "All required SQL fragments were present."
        : `Missing SQL fragments: ${missing.join(", ")}.`,
  };
}

function scoreSqlSafety(forbiddenFragments: string[], sql: string): EvalScore {
  const normalizedSql = sql.toLowerCase();
  const found = forbiddenFragments.filter((fragment) =>
    normalizedSql.includes(fragment.toLowerCase()),
  );
  const startsReadOnly = /^\s*(select|with)\b/iu.test(sql);
  const passed = startsReadOnly && found.length === 0 && !sql.includes(";");

  return {
    name: "sql_safety",
    score: passed ? 1 : 0,
    reason: passed
      ? "SQL is read-only, single-statement, and avoids forbidden fragments."
      : `SQL safety failed. Read-only=${startsReadOnly}; forbidden=${found.join(", ") || "none"}.`,
  };
}

function scoreBoolean(name: string, expected: boolean, actual: boolean): EvalScore {
  const passed = expected === actual;

  return {
    name,
    score: passed ? 1 : 0,
    reason: passed ? `Expected ${name}=${expected}.` : `Expected ${expected}, got ${actual}.`,
  };
}

function scoreExpectedAnswerTerms(
  expectedTerms: string[],
  minimumMatches: number,
  answer: string,
): EvalScore {
  if (expectedTerms.length === 0) {
    return {
      name: "answer_expected_facts",
      score: 1,
      reason: "No expected answer facts were configured for this scenario.",
    };
  }

  const normalizedAnswer = normalizeForFactMatch(answer);
  const matchedTerms = expectedTerms.filter((term) =>
    normalizedAnswer.includes(normalizeForFactMatch(term)),
  );
  const requiredMatches = Math.min(minimumMatches || expectedTerms.length, expectedTerms.length);
  const passed = matchedTerms.length >= requiredMatches;

  return {
    name: "answer_expected_facts",
    score: passed ? 1 : matchedTerms.length / requiredMatches,
    reason: passed
      ? `Matched ${matchedTerms.length}/${expectedTerms.length} expected answer facts: ${matchedTerms.join(", ")}.`
      : `Matched ${matchedTerms.length}/${requiredMatches} required answer facts. Missing: ${expectedTerms
          .filter((term) => !matchedTerms.includes(term))
          .join(", ")}.`,
  };
}

function toBraintrustScore(score: EvalScore) {
  return {
    name: score.name,
    score: score.score,
    metadata: {
      reason: score.reason,
    },
  };
}

function tableWasUsed(requiredTable: string, normalizedUsedTables: string[]): boolean {
  const normalizedRequired = normalizeTableReference(requiredTable);

  return normalizedUsedTables.some(
    (usedTable) => usedTable === normalizedRequired || usedTable.endsWith(`.${normalizedRequired}`),
  );
}

function normalizeTableReference(tableName: string): string {
  return tableName.replaceAll(/[`"]/gu, "").trim().toLowerCase();
}

function normalizeForFactMatch(value: string): string {
  return value.toLowerCase().replaceAll(",", "").replaceAll(/\s+/gu, " ").trim();
}
