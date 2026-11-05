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
function readBackOf(
  output: unknown,
): { matched: boolean; diff: string } | undefined {
  if (!output || typeof output !== "object" || !("readBack" in output)) {
    return undefined;
  }
  const value = (output as { readBack?: unknown }).readBack;
  if (!value || typeof value !== "object") return undefined;
  const record = value as { matched?: unknown; diff?: unknown };
  if (typeof record.diff !== "string" || typeof record.matched !== "boolean") {
    return undefined;
  }
  return { matched: record.matched, diff: record.diff };
}

export function describeApprovedWriteOutput(
  persistedMessage: string,
  output: unknown,
): { persisted: boolean; message: string; diff?: string } {
  if (isDryRunToolOutput(output)) {
    return { persisted: false, message: DRY_RUN_OUTCOME, diff: output.diff };
  }
  const readBack = readBackOf(output);
  if (!readBack) return { persisted: true, message: persistedMessage };
  return {
    persisted: true,
    message: readBack.matched
      ? persistedMessage
      : `${persistedMessage} Read-back does not match what was sent.`,
    diff: readBack.diff,
  };
}
