export type McpWritePolicy = "read-only" | "proposal";

export type McpBackend = "medplum" | "hapi";

/**
 * "stdio" (default) is one operator on one machine, using their own credential
 * from env. "http" is the remote transport designed in docs/remote-mcp.md,
 * where each caller presents their own token and the FHIR credential is
 * obtained per caller. Remote is opt-in, and never the default.
 */
export type McpTransport = "stdio" | "http";

export type McpHttpConfig = {
  port: number;
  /**
   * Loopback by default. A remote transport is only reachable off-host when an
   * operator says so, and the OAuth checks below are what make that safe.
   */
  host: string;
  /**
   * This server's RFC 8707 resource identifier. One value feeds both the token
   * verifier's required audience and the protected resource metadata document,
   * so the two cannot drift: if they did, a client would obtain a token this
   * server then refuses, and the symptom would look like a broken
   * authorization server.
   */
  resource: string;
  /** Issuer of the authorization server that mints tokens for this resource. */
  issuer: string;
  /** That authorization server's JWKS, used to verify signatures offline. */
  jwksUri: string;
  /** Scopes every caller must present. */
  requiredScopes: string[];
  /**
   * The FHIR-side client registered with an identity provider, used for the
   * RFC 8693 exchange that yields each caller's own FHIR token.
   */
  exchangeClientId: string;
  /** The FHIR server's token endpoint, where that exchange is performed. */
  tokenEndpoint: string;
  /** Optional ProjectMembership to pin during the exchange. */
  membershipId?: string;
};

export type McpRuntimeConfig = {
  /**
   * "medplum" (default; token or client-credentials auth) or "hapi" (the
   * repository's local, no-auth FHIR evaluation stack — synthetic data on
   * one machine only, mirroring FHIR_BACKEND in the web app).
   */
  backend: McpBackend;
  baseUrl?: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  writePolicy: McpWritePolicy;
  /** Emit Provenance per approved write (LASTEHR_WRITE_PROVENANCE=true). */
  writeProvenance: boolean;
  /** Write tools unregistered by LASTEHR_WRITE_TOOLS_DISABLED. */
  disabledWriteTools: string[];
  transport: McpTransport;
  /** Present only when transport is "http". */
  http?: McpHttpConfig;
};

export class McpConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigurationError";
  }
}

// A plain string map rather than NodeJS.ProcessEnv: Next.js augments
// ProcessEnv with a required NODE_ENV, which would force every test literal
// (and any embedding caller) to carry unrelated keys. process.env remains
// assignable.
type EnvValues = Record<string, string | undefined>;

function value(env: EnvValues, key: string): string | undefined {
  const candidate = env[key]?.trim();
  return candidate ? candidate : undefined;
}

/**
 * The remote transport's configuration, read only when it is switched on.
 *
 * Every field here is required, and a missing one stops startup rather than
 * degrading. A remote server that starts without an audience to check, or
 * without a JWKS to verify against, would accept tokens it should refuse; and
 * the probe recorded in docs/remote-mcp.md shows a FHIR token looks perfectly
 * valid while being addressed elsewhere. So there is no partial HTTP mode.
 */
function loadHttpConfig(env: EnvValues): McpHttpConfig {
  const required = (key: string): string => {
    const found = value(env, key);
    if (!found) {
      throw new McpConfigurationError(
        `LASTEHR_MCP_TRANSPORT=http requires ${key}. The remote transport verifies every caller's token, and it cannot do that with an incomplete OAuth configuration.`,
      );
    }
    return found;
  };
  const url = (key: string): string => {
    const found = required(key);
    try {
      new URL(found);
    } catch {
      throw new McpConfigurationError(
        `${key} must be a complete URL, for example https://auth.example.com/.`,
      );
    }
    return found;
  };

  const portRaw = value(env, "LASTEHR_MCP_HTTP_PORT") ?? "3400";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new McpConfigurationError(
      `LASTEHR_MCP_HTTP_PORT must be an integer between 1 and 65535; received "${portRaw}".`,
    );
  }

  return {
    port,
    // Loopback unless an operator names something else. Binding everywhere by
    // default would expose a chart API the moment the flag is set, before the
    // OAuth configuration has been checked against a real client.
    host: value(env, "LASTEHR_MCP_HTTP_HOST") ?? "127.0.0.1",
    resource: url("LASTEHR_MCP_RESOURCE"),
    issuer: url("LASTEHR_MCP_OAUTH_ISSUER"),
    jwksUri: url("LASTEHR_MCP_OAUTH_JWKS_URI"),
    requiredScopes: (value(env, "LASTEHR_MCP_REQUIRED_SCOPES") ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    exchangeClientId: required("LASTEHR_MCP_EXCHANGE_CLIENT_ID"),
    tokenEndpoint: url("LASTEHR_MCP_TOKEN_ENDPOINT"),
    membershipId: value(env, "LASTEHR_MCP_MEMBERSHIP_ID"),
  };
}

export function loadMcpConfig(env: EnvValues = process.env): McpRuntimeConfig {
  // Read-only is the permanent default. The single accepted opt-in value is
  // "proposal": elicitation-gated, human-approved writes (see docs/mcp.md).
  // Anything else stays rejected loudly, exactly as the 0.1.x line rejected
  // every value.
  const writesFlag = value(env, "LASTEHR_MCP_WRITES");
  let writePolicy: McpWritePolicy = "read-only";
  if (writesFlag) {
    if (writesFlag !== "proposal") {
      throw new McpConfigurationError(
        '@lastehr/mcp is read-only by default. The only accepted LASTEHR_MCP_WRITES value is "proposal" (elicitation-gated writes that a human approves per action); remove the flag or set it to that.',
      );
    }
    writePolicy = "proposal";
  }
  const writeProvenance = value(env, "LASTEHR_WRITE_PROVENANCE") === "true";

  const transportFlag = value(env, "LASTEHR_MCP_TRANSPORT") ?? "stdio";
  if (transportFlag !== "stdio" && transportFlag !== "http") {
    throw new McpConfigurationError(
      `Unknown LASTEHR_MCP_TRANSPORT "${transportFlag}". Supported values: stdio (default), http.`,
    );
  }
  const transport: McpTransport = transportFlag;
  const http = transport === "http" ? loadHttpConfig(env) : undefined;

  // Static write-tool disables. Unknown names are rejected loudly: a typo
  // in a tightening control would otherwise silently disable nothing.
  const KNOWN_WRITE_TOOLS = [
    "add_note",
    "record_observation",
    "record_superseding_observation",
    "create_task",
  ];
  const disabledWriteTools = (value(env, "LASTEHR_WRITE_TOOLS_DISABLED") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknownDisables = disabledWriteTools.filter(
    (name) => !KNOWN_WRITE_TOOLS.includes(name),
  );
  if (unknownDisables.length > 0) {
    throw new McpConfigurationError(
      `Unknown write tool name(s) in LASTEHR_WRITE_TOOLS_DISABLED: ` +
        `${unknownDisables.join(", ")}. Valid names: ${KNOWN_WRITE_TOOLS.join(", ")}.`,
    );
  }

  const backend = value(env, "FHIR_BACKEND") ?? "medplum";
  if (backend !== "medplum" && backend !== "hapi") {
    throw new McpConfigurationError(
      `Unknown FHIR_BACKEND "${backend}" for @lastehr/mcp. Supported values: medplum (default), hapi.`,
    );
  }

  if (backend === "hapi") {
    if (transport === "http") {
      // The local HAPI stack has no auth and no per-user identity, so there is
      // no caller token to verify and nothing for the exchange to return. A
      // remote transport in front of it would publish an unauthenticated chart
      // API, which docs/remote-mcp.md lists as a thing this must not do.
      throw new McpConfigurationError(
        "LASTEHR_MCP_TRANSPORT=http cannot be combined with FHIR_BACKEND=hapi. The local HAPI stack has no authentication, so a remote transport in front of it would expose an unauthenticated chart API.",
      );
    }
    // The same env pair the web app and seed honor. No credentials: the
    // local evaluation stack is no-auth by design, so any configured
    // MEDPLUM_* values are simply unused in this mode (a checkout's .env
    // commonly carries both).
    const hapiBaseUrl =
      value(env, "HAPI_BASE_URL") ?? value(env, "FHIR_BASE_URL");
    if (!hapiBaseUrl) {
      throw new McpConfigurationError(
        "FHIR_BACKEND=hapi requires HAPI_BASE_URL or FHIR_BASE_URL (for example http://localhost:8080/fhir).",
      );
    }
    try {
      new URL(hapiBaseUrl);
    } catch {
      throw new McpConfigurationError(
        "The HAPI base URL must be a complete URL, for example http://localhost:8080/fhir.",
      );
    }
    return {
      backend,
      baseUrl: hapiBaseUrl,
      writePolicy,
      writeProvenance,
      disabledWriteTools,
      transport,
    };
  }

  const accessToken = value(env, "MEDPLUM_ACCESS_TOKEN");
  const clientId = value(env, "MEDPLUM_CLIENT_ID");
  const clientSecret = value(env, "MEDPLUM_CLIENT_SECRET");
  const baseUrl = value(env, "MEDPLUM_BASE_URL");

  if (baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      throw new McpConfigurationError(
        "MEDPLUM_BASE_URL must be a complete URL, for example https://api.medplum.com/.",
      );
    }
  }

  if (accessToken && (clientId || clientSecret)) {
    throw new McpConfigurationError(
      "Set either MEDPLUM_ACCESS_TOKEN or MEDPLUM_CLIENT_ID plus MEDPLUM_CLIENT_SECRET, not both.",
    );
  }

  if (clientId || clientSecret) {
    if (!clientId || !clientSecret) {
      throw new McpConfigurationError(
        "MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET must be set together.",
      );
    }
  } else if (!accessToken && transport === "stdio") {
    // Required for stdio, where the process acts as one operator. Under the
    // remote transport each caller presents their own token and the FHIR
    // credential is obtained per caller, so a server-held credential is not
    // just unnecessary — holding one would make this layer, rather than the
    // FHIR backend, decide what a caller can reach.
    throw new McpConfigurationError(
      "Set MEDPLUM_ACCESS_TOKEN or MEDPLUM_CLIENT_ID plus MEDPLUM_CLIENT_SECRET before starting Last EHR MCP.",
    );
  }

  return {
    backend,
    baseUrl,
    accessToken,
    clientId,
    clientSecret,
    writePolicy,
    writeProvenance,
    disabledWriteTools,
    transport,
    http,
  };
}
