import type {
  Bundle,
  ExtractResource,
  ResourceType,
} from "@medplum/fhirtypes";

import { FhirRestBackend } from "./rest";
import {
  assessSmartAuth,
  epicAuthError,
  type SmartAuthEnv,
} from "./smart-config";
import {
  createSmartBackendServicesTokenSource,
  loadSmartPrivateKey,
} from "./smart-backend";
import { EPIC_VENDOR_PROFILE, type VendorProfile } from "./vendor-profile";

/**
 * Epic's public FHIR R4 sandbox, as published by the sandbox CapabilityStatement
 * `implementation.url` on 2026-11-04. Patient data is not readable without a
 * token (unauthenticated Patient search returned HTTP 401).
 */
export const EPIC_SANDBOX_BASE_URL =
  "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";

/** Token URL from the same sandbox's SMART configuration. */
export const EPIC_SANDBOX_TOKEN_URL =
  "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token";

export const EPIC_SEARCH_SCOPE_MESSAGE =
  "Epic search was refused (HTTP 403). This app lacks the search scope. Patient, Encounter, and Observation searches need a scope that includes search; a direct read of a known id can still succeed.";

export type EpicBackendOptions = {
  /**
   * Pre-minted access token. Skips the backend-services assertion entirely.
   * Tests and operators who mint outside this process use this.
   */
  accessToken?: string;
  /** Non-production client id from an app registered on fhir.epic.com. Not a secret. */
  clientId?: string;
  /**
   * PKCS#8 PEM private key whose public half is registered on that app.
   * Never log this, and do not commit it.
   */
  privateKeyPem?: string;
  /** Optional `kid` for a JWKS-registered key. */
  privateKeyId?: string;
  /**
   * Optional space-delimited SMART scopes. Omitted unless set: Epic's
   * documented token POST requires grant_type, client_assertion_type, and
   * client_assertion, and app scopes are pre-registered.
   */
  scopes?: string;
  baseUrl?: string;
  tokenUrl?: string;
  fetch?: typeof globalThis.fetch;
};

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }
  const status = (error as { statusCode: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * Epic FHIR R4 sandbox over SMART Backend Services (client credentials
 * with a private-key JWT). Standalone launch is not implemented: it needs
 * a browser login this process does not run.
 *
 * Writes are POSTed. Epic's sandbox does not support delete, so an
 * approved write stays on the sandbox. The vendor profile adds the
 * flowsheet coding and requires an encounter before approval.
 *
 * Registered as `FHIR_BACKEND=epic` only when
 * `LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1` and credentials are present.
 * No secret is built in.
 */
export class EpicBackend extends FhirRestBackend {
  readonly vendorProfile: VendorProfile = EPIC_VENDOR_PROFILE;

  constructor(options: EpicBackendOptions = {}) {
    const {
      accessToken,
      clientId,
      privateKeyPem,
      privateKeyId,
      scopes,
      baseUrl = EPIC_SANDBOX_BASE_URL,
      tokenUrl = EPIC_SANDBOX_TOKEN_URL,
      fetch: fetchFn,
    } = options;
    if (!accessToken && !(clientId && privateKeyPem)) {
      throw new Error(
        "EpicBackend requires an accessToken, or a clientId and privateKeyPem for SMART Backend Services. No secret is built in.",
      );
    }

    const token =
      accessToken || !clientId || !privateKeyPem
        ? undefined
        : createSmartBackendServicesTokenSource({
            clientId,
            privateKeyPem,
            keyId: privateKeyId,
            scopes,
            tokenUrl,
            fetch: fetchFn,
          });

    super({
      baseUrl,
      getHeaders: token
        ? async () => ({ authorization: `Bearer ${await token()}` })
        : () => ({ authorization: `Bearer ${accessToken}` }),
      fetch: fetchFn,
    });
  }

  static fromEnv(env: SmartAuthEnv = process.env): EpicBackend {
    const auth = assessSmartAuth(env, "epic");
    if (auth.state === "partial") throw new Error(epicAuthError(auth.detail));
    if (auth.state !== "ready") throw new Error(epicAuthError());
    if (auth.mode === "token") {
      return new EpicBackend({
        accessToken: auth.accessToken,
        baseUrl: auth.baseUrl,
        tokenUrl: auth.tokenUrl,
      });
    }
    return new EpicBackend({
      clientId: auth.clientId,
      privateKeyPem: loadSmartPrivateKey(auth),
      privateKeyId: auth.keyId,
      scopes: auth.scopes,
      baseUrl: auth.baseUrl,
      tokenUrl: auth.tokenUrl,
    });
  }

  override async search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>> {
    try {
      return await super.search(resourceType, params);
    } catch (error) {
      // Token failures also carry statusCode. Only a FHIR search 403 means
      // the app's scopes do not include search.
      if (
        statusCodeOf(error) === 403 &&
        error instanceof Error &&
        error.message.startsWith("FHIR request failed")
      ) {
        throw Object.assign(new Error(EPIC_SEARCH_SCOPE_MESSAGE), {
          statusCode: 403,
          code: "FHIR_SEARCH_SCOPE",
        });
      }
      throw error;
    }
  }
}
