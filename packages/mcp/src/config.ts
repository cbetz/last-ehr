export type McpWritePolicy = "read-only" | "proposal";

export type McpBackend = "medplum" | "hapi";

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

  // Static write-tool disables. Unknown names are rejected loudly: a typo
  // in a tightening control would otherwise silently disable nothing.
  const KNOWN_WRITE_TOOLS = ["add_note", "record_observation"];
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
  } else if (!accessToken) {
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
  };
}
