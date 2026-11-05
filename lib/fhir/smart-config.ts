import { experimentalFhirAdaptersEnabled } from "./experimental";

/**
 * String-only view of SMART Backend Services env. No file reads and no
 * logging: callers that need the PEM read it themselves and must not put
 * the key or a minted token into an error or a log line.
 *
 * One process points at one FHIR server. `LASTEHR_*` wins over the
 * vendor-specific `EPIC_*` / `ORACLE_*` names kept for the earlier scaffold.
 */
export type SmartAuthEnv = Record<string, string | undefined>;

export type SmartAuthAssessment =
  | { state: "absent" }
  | { state: "partial"; detail: string }
  | {
      state: "ready";
      mode: "token";
      accessToken: string;
      baseUrl?: string;
      tokenUrl?: string;
    }
  | {
      state: "ready";
      mode: "jwt";
      clientId: string;
      privateKeyPem?: string;
      privateKeyPath?: string;
      keyId?: string;
      scopes?: string;
      baseUrl?: string;
      tokenUrl?: string;
    };

function pick(env: SmartAuthEnv, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function assessSmartAuth(
  env: SmartAuthEnv,
  vendor: "epic" | "oracle",
): SmartAuthAssessment {
  const prefix = vendor === "epic" ? "EPIC" : "ORACLE";
  const accessToken = pick(env, [`${prefix}_ACCESS_TOKEN`]);
  const clientId = pick(env, ["LASTEHR_CLIENT_ID", `${prefix}_CLIENT_ID`]);
  const privateKeyPem = pick(env, ["LASTEHR_PRIVATE_KEY", `${prefix}_PRIVATE_KEY`]);
  const privateKeyPath = pick(env, [
    "LASTEHR_PRIVATE_KEY_PATH",
    `${prefix}_PRIVATE_KEY_PATH`,
  ]);
  const keyId = pick(env, [
    "LASTEHR_KEY_ID",
    `${prefix}_KEY_ID`,
    vendor === "epic" ? "EPIC_PRIVATE_KEY_ID" : "",
  ]);
  const scopes = pick(env, ["LASTEHR_SCOPES", `${prefix}_SCOPES`]);
  const baseUrl = pick(env, [
    "LASTEHR_FHIR_BASE_URL",
    vendor === "epic" ? "EPIC_BASE_URL" : "ORACLE_FHIR_BASE_URL",
  ]);
  const tokenUrl = pick(env, ["LASTEHR_TOKEN_URL", `${prefix}_TOKEN_URL`]);

  // A pre-minted token skips the assertion. The token value stays in memory
  // and is never written into the partial-config error below.
  if (accessToken) {
    return { state: "ready", mode: "token", accessToken, baseUrl, tokenUrl };
  }

  const any = Boolean(
    clientId || privateKeyPem || privateKeyPath || keyId || scopes || tokenUrl,
  );
  if (!any) return { state: "absent" };

  const missing: string[] = [];
  if (!clientId) missing.push("LASTEHR_CLIENT_ID");
  if (!privateKeyPem && !privateKeyPath) {
    missing.push("LASTEHR_PRIVATE_KEY or LASTEHR_PRIVATE_KEY_PATH");
  }
  // Oracle's token endpoint rejects client_credentials without scope.
  // Epic's documented token POST does not include scope.
  if (vendor === "oracle" && !scopes) missing.push("LASTEHR_SCOPES");
  if (missing.length > 0) {
    return { state: "partial", detail: missing.join(", ") };
  }

  return {
    state: "ready",
    mode: "jwt",
    clientId: clientId as string,
    privateKeyPem,
    privateKeyPath,
    keyId,
    scopes,
    baseUrl,
    tokenUrl,
  };
}

export function epicAuthError(detail?: string): string {
  const base =
    "FHIR_BACKEND=epic requires SMART Backend Services credentials: LASTEHR_CLIENT_ID and LASTEHR_PRIVATE_KEY (or LASTEHR_PRIVATE_KEY_PATH), or EPIC_CLIENT_ID and EPIC_PRIVATE_KEY, or EPIC_ACCESS_TOKEN. No secret is built in. See docs/adapters/epic-cerner.md.";
  return detail ? `${base} Missing: ${detail}.` : base;
}

export function oracleAuthError(detail: string): string {
  return (
    `FHIR_BACKEND=oracle-health SMART config is incomplete (${detail}). ` +
    "Oracle requires LASTEHR_SCOPES; Epic does not. " +
    "Unset the partial credentials to use the open read-only sandbox. " +
    "See docs/adapters/epic-cerner.md."
  );
}

export function sandboxFlagOn(env: SmartAuthEnv = process.env): boolean {
  return experimentalFhirAdaptersEnabled(env as NodeJS.ProcessEnv);
}
