import {
  type CloudCostCopilotDependencies,
  type CopilotQuestion,
  type SandboxValidationResult,
  sandboxValidationResultSchema,
} from "./schemas";

export async function validateInSandbox(
  sql: string,
  input: CopilotQuestion,
  dependencies: CloudCostCopilotDependencies,
): Promise<SandboxValidationResult> {
  const sandbox =
    dependencies.sandboxDatabricks ??
    (input.runMode === "mock" ? dependencies.databricks : undefined);

  if (!sandbox) {
    return sandboxValidationResultSchema.parse({
      passed: true,
      rowCount: 0,
      previewRows: [],
      warnings: [
        "No sandbox connector configured; deterministic SQL safety was used as the sandbox gate.",
      ],
    });
  }

  const result = await sandbox.runReadOnlyQuery(sql);
  const warnings = result.rowCount === 0 ? ["Sandbox query returned no rows."] : [];

  return sandboxValidationResultSchema.parse({
    passed: warnings.length === 0,
    rowCount: result.rowCount,
    previewRows: result.rows.slice(0, 5),
    warnings,
  });
}
