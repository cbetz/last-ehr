export const DRY_RUN_OUTCOME =
  "Approved and staged as a dry-run. Nothing was written to the FHIR server.";

export function isDryRunToolOutput(
  output: unknown,
): output is { dryRun: true; persisted: false; diff: string } {
  if (!output || typeof output !== "object") return false;
  const record = output as {
    dryRun?: unknown;
    persisted?: unknown;
    diff?: unknown;
  };
  return (
    record.dryRun === true &&
    record.persisted === false &&
    typeof record.diff === "string"
  );
}

/**
 * What the approval card's result should say. A persisted write keeps the
 * caller's success copy. A dry-run result must not reuse that copy.
 * This module stays free of Node built-ins so the demo client can import it.
 */
export function describeApprovedWriteOutput(
  persistedMessage: string,
  output: unknown,
): { persisted: boolean; message: string; diff?: string } {
  if (isDryRunToolOutput(output)) {
    return { persisted: false, message: DRY_RUN_OUTCOME, diff: output.diff };
  }
  return { persisted: true, message: persistedMessage };
}
