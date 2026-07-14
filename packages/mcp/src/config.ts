export type McpWritePolicy = "read-only";

export type McpRuntimeConfig = {
  baseUrl?: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  writePolicy: McpWritePolicy;
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

  if (value(env, "LASTEHR_MCP_WRITES")) {
    throw new McpConfigurationError(
      "@lastehr/mcp 0.1 is intentionally read-only. Remove LASTEHR_MCP_WRITES from this server configuration.",
    );
  }

  return {
    baseUrl,
    accessToken,
    clientId,
    clientSecret,
    writePolicy: "read-only",
  };
}
