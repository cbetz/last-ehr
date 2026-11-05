import { readFileSync } from "node:fs";

export const EPIC_SANDBOX_BASE_URL =
  "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";
export const EPIC_SANDBOX_TOKEN_URL =
  "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token";
export const ORACLE_SANDBOX_BASE_URL =
  "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d";
export const ORACLE_SANDBOX_TOKEN_URL =
  "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token";

export type SandboxBackend = "epic" | "oracle" | "smart";

export type SandboxConfig = {
  backend: SandboxBackend;
  /** Set for epic and oracle. Unset for a generic SMART server. */
  profile?: "epic" | "oracle";
  baseUrl: string;
  tokenUrl: string;
  clientId?: string;
  /** Present only in memory. Never interpolate this into a log or error. */
  privateKeyPem?: string;
  keyId?: string;
  scopes?: string;
  /** Present only in memory. Never interpolate this into a log or error. */
  accessToken?: string;
  jwksUrl?: string;
  encounter?: string;
  performer?: string;
};

type Env = Record<string, string | undefined>;

function pick(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function normalizePem(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

export function experimentalSandboxEnabled(env: Env): boolean {
  const value = pick(env, "LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS");
  return value === "1" || value === "true";
}

export function isSandboxBackend(value: string): value is SandboxBackend {
  return value === "epic" || value === "oracle" || value === "smart";
}

function readPrivateKey(env: Env): { pem?: string; error?: string } {
  const inline =
    pick(env, "LASTEHR_PRIVATE_KEY") ??
    pick(env, "EPIC_PRIVATE_KEY") ??
    pick(env, "ORACLE_PRIVATE_KEY");
  if (inline) return { pem: normalizePem(inline) };
  const path =
    pick(env, "LASTEHR_PRIVATE_KEY_PATH") ??
    pick(env, "EPIC_PRIVATE_KEY_PATH") ??
    pick(env, "ORACLE_PRIVATE_KEY_PATH");
  if (!path) return {};
  try {
    return { pem: normalizePem(readFileSync(path, "utf8")) };
  } catch {
    return {
      error:
        "Could not read LASTEHR_PRIVATE_KEY_PATH. The file contents were not logged.",
    };
  }
}

/**
 * Read LASTEHR_BACKEND without logging secrets. Absent when the variable
 * is unset. Errors name env vars only.
 */
export type SandboxRead =
  | { state: "absent" }
  | { state: "error"; message: string }
  | { state: "ready"; config: SandboxConfig };

export function readSandboxConfig(env: Env): SandboxRead {
  const selected = pick(env, "LASTEHR_BACKEND");
  if (!selected) return { state: "absent" };
  if (!isSandboxBackend(selected)) {
    return {
      state: "error",
      message:
        `Unknown LASTEHR_BACKEND "${selected}". Supported values: epic, oracle, smart.`,
    };
  }
  if (!experimentalSandboxEnabled(env)) {
    return {
      state: "error",
      message:
        "LASTEHR_BACKEND stays off unless LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1. Epic and Oracle Health sandboxes do not support delete, so an approved write persists. See docs/adapters/epic-cerner.md.",
    };
  }
  const accessToken =
    pick(env, "LASTEHR_ACCESS_TOKEN") ??
    (selected === "epic" ? pick(env, "EPIC_ACCESS_TOKEN") : undefined) ??
    (selected === "oracle" ? pick(env, "ORACLE_ACCESS_TOKEN") : undefined);
  const clientId =
    pick(env, "LASTEHR_CLIENT_ID") ??
    (selected === "epic" ? pick(env, "EPIC_CLIENT_ID") : undefined) ??
    (selected === "oracle" ? pick(env, "ORACLE_CLIENT_ID") : undefined);
  const key = readPrivateKey(env);
  if (key.error) return { state: "error", message: key.error };
  const scopes =
    pick(env, "LASTEHR_SCOPES") ??
    (selected === "epic"
      ? pick(env, "EPIC_SCOPES")
      : selected === "oracle"
        ? pick(env, "ORACLE_SCOPES")
        : undefined);
  const baseUrl =
    pick(env, "LASTEHR_FHIR_BASE_URL") ??
    (selected === "epic" ? EPIC_SANDBOX_BASE_URL : selected === "oracle" ? ORACLE_SANDBOX_BASE_URL : undefined);
  const tokenUrl =
    pick(env, "LASTEHR_TOKEN_URL") ??
    (selected === "epic" ? EPIC_SANDBOX_TOKEN_URL : selected === "oracle" ? ORACLE_SANDBOX_TOKEN_URL : undefined);

  if (!accessToken && !(clientId && key.pem)) {
    return {
      state: "error",
      message:
        "LASTEHR_BACKEND requires LASTEHR_CLIENT_ID and LASTEHR_PRIVATE_KEY or LASTEHR_PRIVATE_KEY_PATH, or LASTEHR_ACCESS_TOKEN. No secret is built in.",
    };
  }
  if (!accessToken && selected === "oracle" && !scopes) {
    return {
      state: "error",
      message:
        "Oracle requires LASTEHR_SCOPES. Epic does not. The token endpoint rejects client_credentials without a scope.",
    };
  }
  if (!baseUrl || !tokenUrl) {
    return {
      state: "error",
      message:
        "LASTEHR_BACKEND=smart requires LASTEHR_FHIR_BASE_URL and LASTEHR_TOKEN_URL.",
    };
  }
  try {
    const base = new URL(baseUrl);
    const token = new URL(tokenUrl);
    if (!["https:", "http:"].includes(base.protocol) || !["https:", "http:"].includes(token.protocol)) {
      throw new Error("protocol");
    }
    if (base.username || base.password || token.username || token.password) {
      throw new Error("userinfo");
    }
  } catch {
    return {
      state: "error",
      message:
        "LASTEHR_FHIR_BASE_URL and LASTEHR_TOKEN_URL must be HTTP(S) URLs without userinfo.",
    };
  }

  const jwksUrl = pick(env, "LASTEHR_JWKS_URL");
  if (jwksUrl) {
    try {
      const url = new URL(jwksUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("jwks");
      }
    } catch {
      return {
        state: "error",
        message: "LASTEHR_JWKS_URL must be an https URL without userinfo.",
      };
    }
  }

  return {
    state: "ready",
    config: {
      backend: selected,
      ...(selected === "smart" ? {} : { profile: selected }),
      baseUrl,
      tokenUrl,
      clientId,
      privateKeyPem: key.pem,
      keyId: pick(env, "LASTEHR_KEY_ID") ?? pick(env, "EPIC_PRIVATE_KEY_ID") ?? pick(env, "ORACLE_KEY_ID"),
      scopes,
      accessToken,
      jwksUrl,
      encounter: pick(env, "LASTEHR_ENCOUNTER"),
      performer: pick(env, "LASTEHR_PERFORMER"),
    },
  };
}
