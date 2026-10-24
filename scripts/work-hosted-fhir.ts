import {
  createWorkDemoFhirAdapter,
  validateWorkDemoFhirUrl,
  WORK_DEMO_FHIR_URL,
  type WorkDemoFhirAdapter,
} from "./work-demo-fhir";

export const WORK_HOSTED_FHIR_URL = "http://hapi:8080/fhir";

/** The private Compose service is the only permitted non-loopback backend. */
export function validateWorkHostedFhirUrl(value: string): string {
  if (value === WORK_HOSTED_FHIR_URL) return value;
  try {
    return validateWorkDemoFhirUrl(value);
  } catch {
    throw new Error("The hosted synthetic work service requires its private Compose HAPI URL or an explicit numeric loopback FHIR URL.");
  }
}

/**
 * Preserve the local adapter's exact invented-fixture and conditional-create
 * contract. Only its already validated request prefix is translated for the
 * dedicated container network; callers cannot supply an arbitrary FHIR host.
 */
export function createWorkHostedFhirAdapter({
  baseUrl = WORK_HOSTED_FHIR_URL,
  fetch: fetcher = globalThis.fetch,
  timeoutMs,
}: {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
} = {}): WorkDemoFhirAdapter {
  const target = validateWorkHostedFhirUrl(baseUrl);
  const prefix = `${WORK_DEMO_FHIR_URL}/`;
  return createWorkDemoFhirAdapter({
    baseUrl: WORK_DEMO_FHIR_URL,
    timeoutMs,
    fetch: (input, init) => {
      if (typeof input !== "string" || !input.startsWith(prefix)) {
        throw new Error("The hosted synthetic FHIR request is outside the adapter scope.");
      }
      return fetcher(`${target}/${input.slice(prefix.length)}`, init);
    },
  });
}
