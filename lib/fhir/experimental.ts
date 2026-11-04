/**
 * Experimental sandbox adapters (Oracle Health open sandbox, Epic scaffold)
 * stay out of the supported factory until this is set. Unset, "0", and any
 * other value leave `FHIR_BACKEND=oracle-health|epic` refused, so a deploy
 * that does not opt in keeps today's backend list.
 */
export function experimentalFhirAdaptersEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const value = env.LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS;
  return value === "1" || value === "true";
}
