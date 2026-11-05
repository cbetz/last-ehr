/**
 * Epic and Oracle Health sandbox adapters stay behind this flag. Unset,
 * "0", and any other value leave `FHIR_BACKEND=oracle-health|epic` refused.
 * The flag stays because those sandboxes do not support delete, so the
 * contract harness and the safety eval cannot clean up, and because the
 * proven write is one Observation shape per vendor rather than the full
 * tool contract. See docs/adapters/epic-cerner.md.
 */
export function experimentalFhirAdaptersEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS;
  return value === "1" || value === "true";
}
