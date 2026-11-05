import type {
  Bundle,
  ExtractResource,
  Resource,
  ResourceType,
} from "@medplum/fhirtypes";

import { stageDryRunWrite } from "./dry-run-write";
import { FhirRestBackend } from "./rest";
import {
  assessSmartAuth,
  oracleAuthError,
  type SmartAuthEnv,
} from "./smart-config";
import {
  createSmartBackendServicesTokenSource,
  loadSmartPrivateKey,
} from "./smart-backend";
import { ORACLE_VENDOR_PROFILE, type VendorProfile } from "./vendor-profile";

/**
 * Public open sandbox documented by Oracle Health. No Authorization header.
 * Synthetic sandbox records only. Reads are live; writes are not routed
 * (verified 2026-11-04: POST and DELETE answer HTTP 404). See
 * docs/adapters/epic-cerner.md.
 */
export const ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL =
  "https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d";

/**
 * Secure sandbox used by the authenticated adapter. Override with
 * LASTEHR_FHIR_BASE_URL / LASTEHR_TOKEN_URL for another tenant.
 */
export const ORACLE_HEALTH_SECURE_BASE_URL =
  "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d";

export const ORACLE_HEALTH_SECURE_TOKEN_URL =
  "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token";

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
  /** Defaults to the public open sandbox when unauthenticated. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Pre-minted bearer. Skips the private-key assertion. */
  accessToken?: string;
  /** SMART Backend Services token source. Presence selects the write path. */
  getAccessToken?: () => Promise<string>;
  tokenUrl?: string;
};

/**
 * Oracle Health (Cerner) adapter.
 *
 * Without a token this is the public open sandbox: reads only, and an
 * approved write is staged as a dry-run. With SMART Backend Services
 * credentials it POSTs to the secure sandbox. That sandbox does not
 * support delete, so an approved write stays there. The vendor profile
 * requires a legal-authenticator performer and an allowlisted vital code
 * before the human approves.
 */
export class OracleHealthBackend extends FhirRestBackend {
  private readonly authed: boolean;

  constructor(options: OracleHealthBackendOptions = {}) {
    const authed = Boolean(options.accessToken || options.getAccessToken);
    super({
      baseUrl:
        options.baseUrl ||
        (authed
          ? ORACLE_HEALTH_SECURE_BASE_URL
          : ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL),
      fetch: options.fetch,
      getHeaders: authed
        ? async () => ({
            authorization: `Bearer ${
              options.getAccessToken
                ? await options.getAccessToken()
                : options.accessToken
            }`,
          })
        : undefined,
    });
    this.authed = authed;
  }

  static fromEnv(env: SmartAuthEnv = process.env): OracleHealthBackend {
    const auth = assessSmartAuth(env, "oracle");
    if (auth.state === "partial") throw new Error(oracleAuthError(auth.detail));
    if (auth.state === "absent") {
      return new OracleHealthBackend({
        baseUrl: env.ORACLE_HEALTH_BASE_URL || undefined,
      });
    }
    if (auth.mode === "token") {
      return new OracleHealthBackend({
        accessToken: auth.accessToken,
        baseUrl: auth.baseUrl,
      });
    }
    const tokenUrl = auth.tokenUrl || ORACLE_HEALTH_SECURE_TOKEN_URL;
    const pem = loadSmartPrivateKey(auth);
    return new OracleHealthBackend({
      baseUrl: auth.baseUrl,
      getAccessToken: createSmartBackendServicesTokenSource({
        clientId: auth.clientId,
        privateKeyPem: pem,
        keyId: auth.keyId,
        scopes: auth.scopes,
        tokenUrl,
      }),
    });
  }

  get writeDisposition(): "persist" | "dry-run" {
    return this.authed ? "persist" : "dry-run";
  }

  get vendorProfile(): VendorProfile | undefined {
    return this.authed ? ORACLE_VENDOR_PROFILE : undefined;
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
    if (this.authed) return super.createResource(resource);
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
    if (this.authed) {
      // The secure sandbox's CapabilityStatement does not list delete for
      // Observation or Patient. The call still goes out so the server's
      // answer is the error, and the docs say the write persists.
      return super.deleteResource(resourceType, id);
    }
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
