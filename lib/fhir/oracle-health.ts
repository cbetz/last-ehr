import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import { stageDryRunWrite } from "./dry-run-write";
import { FhirRestBackend } from "./rest";

/**
 * Public open sandbox documented by Oracle Health. No Authorization header.
 * Synthetic sandbox records only. Reads are live; writes are not routed
 * (verified 2026-11-04: POST and DELETE answer HTTP 404). See
 * docs/adapters/epic-cerner.md.
 */
export const ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL =
  "https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d";

/**
 * The open sandbox rejects `_count` whenever `_id` is also set
 * ("_count: unsupported when _id is provided", HTTP 400). The chart tools
 * always send both for a single-resource lookup, so drop `_count` and keep
 * the `_id` search the adapter contract requires.
 */
export function adjustOracleHealthSearchParams(
  params?: Record<string, string>,
): Record<string, string> | undefined {
  if (!params?._id || !params._count) return params;
  const rest = { ...params };
  delete rest._count;
  return rest;
}

export type OracleHealthBackendOptions = {
  /** Defaults to the public open sandbox. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Read-only adapter for the Oracle Health (Cerner) open sandbox.
 * `writeDisposition` is `dry-run`: the approval gate stages and diffs a
 * proposed resource instead of POSTing it. `createResource` and
 * `deleteResource` refuse locally so a caller that skips the gate still
 * cannot write.
 *
 * Registered as `FHIR_BACKEND=oracle-health` only when
 * `LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1`.
 */
export class OracleHealthBackend extends FhirRestBackend {
  readonly writeDisposition = "dry-run" as const;

  constructor(options: OracleHealthBackendOptions = {}) {
    super({
      baseUrl: options.baseUrl || ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL,
      fetch: options.fetch,
    });
  }

  override search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    return super.search(
      resourceType,
      adjustOracleHealthSearchParams(params),
    );
  }

  override async createResource<T extends Resource>(
    resource: T,
  ): Promise<T & { id: string }> {
    stageDryRunWrite(this, resource);
    throw Object.assign(
      new Error(
        "Oracle Health open sandbox is read-only. The proposed resource was staged as a dry-run and was not written.",
      ),
      { code: "FHIR_DRY_RUN" },
    );
  }

  override async deleteResource(
    resourceType: ResourceType,
    id: string,
  ): Promise<void> {
    void resourceType;
    void id;
    throw Object.assign(
      new Error(
        "Oracle Health open sandbox is read-only. deleteResource was not sent.",
      ),
      { code: "FHIR_READ_ONLY" },
    );
  }
}
