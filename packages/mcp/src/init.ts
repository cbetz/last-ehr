import { MCP_SERVER_VERSION } from "./server.js";
import type { SandboxBackend } from "./sandbox-config.js";

export type McpClient = "json" | "claude-code" | "cursor";
export type InitBackend = "medplum" | SandboxBackend;

const packageSpecifier = `@lastehr/mcp@${MCP_SERVER_VERSION}`;

const mcpConfig = {
  mcpServers: {
    lastehr: {
      command: "npx",
      args: ["-y", packageSpecifier],
      env: {
        MEDPLUM_ACCESS_TOKEN: "<replace-with-a-least-privilege-token>",
      },
    },
  },
};

const SANDBOX_ENV: Record<SandboxBackend, Record<string, string>> = {
  epic: {
    LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
    LASTEHR_BACKEND: "epic",
    LASTEHR_MCP_WRITES: "proposal",
    LASTEHR_FHIR_BASE_URL: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
    LASTEHR_TOKEN_URL: "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
    LASTEHR_CLIENT_ID: "<non-production-client-id>",
    LASTEHR_PRIVATE_KEY_PATH: "<path-to-pkcs8-pem>",
    LASTEHR_KEY_ID: "<jwks-kid>",
    LASTEHR_JWKS_URL: "<https-url-of-your-public-jwks>",
    LASTEHR_ENCOUNTER: "<Encounter/id>",
  },
  oracle: {
    LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
    LASTEHR_BACKEND: "oracle",
    LASTEHR_MCP_WRITES: "proposal",
    LASTEHR_FHIR_BASE_URL:
      "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d",
    LASTEHR_TOKEN_URL:
      "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token",
    LASTEHR_CLIENT_ID: "<system-client-id>",
    LASTEHR_PRIVATE_KEY_PATH: "<path-to-pkcs8-pem>",
    LASTEHR_KEY_ID: "<jwks-kid>",
    LASTEHR_JWKS_URL: "<https-url-of-your-public-jwks>",
    LASTEHR_SCOPES:
      "system/Patient.read system/Observation.read system/Observation.write system/Encounter.read",
    LASTEHR_PERFORMER: "<Practitioner/id>",
  },
  smart: {
    LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS: "1",
    LASTEHR_BACKEND: "smart",
    LASTEHR_MCP_WRITES: "proposal",
    LASTEHR_FHIR_BASE_URL: "<https-fhir-base-url>",
    LASTEHR_TOKEN_URL: "<https-token-url>",
    LASTEHR_CLIENT_ID: "<client-id>",
    LASTEHR_PRIVATE_KEY_PATH: "<path-to-pkcs8-pem>",
    LASTEHR_KEY_ID: "<jwks-kid>",
    LASTEHR_JWKS_URL: "<https-url-of-your-public-jwks>",
    LASTEHR_SCOPES: "<optional-space-delimited-scopes>",
  },
};

export function sandboxGuide(backend: SandboxBackend): string {
  return [
    `Ten-minute setup for LASTEHR_BACKEND=${backend}. Synthetic sandbox patients only. Not a clinical or compliance claim.`,
    "1. Generate an RSA key: openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out lastehr-sandbox.pem",
    "2. Print a public JWKS (no private field d): npx tsx scripts/print-sandbox-jwks.ts lastehr-sandbox.pem <kid>",
    "3. Host that JWKS at an https URL and register it on the sandbox app (Epic non-production Backend Systems, or Oracle system app, private_key_jwt RS384).",
    "4. Fill every <placeholder> in the config. LASTEHR_SCOPES is required for Oracle and optional for Epic.",
    "5. npx @lastehr/mcp doctor   — checks the key, JWKS kid, token exchange, granted scopes, and whether search is allowed. It does not print secrets.",
    "6. Ask for one observation and approve it in the client. Epic: a heart rate needs LASTEHR_ENCOUNTER (flowsheet code 8 plus LOINC 8867-4). Oracle: an oral temperature (LOINC 8331-1) needs LASTEHR_PERFORMER as legal authenticator. LOINC 8867-4 is refused.",
    "These sandboxes do not support delete. An approved observation persists.",
    "The experimental flag stays on because there is no delete, so the safety eval cannot clean up.",
    "",
  ].join("\n");
}

export function renderInit(
  client: McpClient = "json",
  backend: InitBackend = "medplum",
): string {
  if (backend !== "medplum") {
    const server = {
      command: "npx",
      args: ["-y", packageSpecifier],
      env: SANDBOX_ENV[backend],
    };
    const config =
      client === "cursor"
        ? { mcpServers: { lastehr: { type: "stdio", ...server } } }
        : { mcpServers: { lastehr: server } };
    if (client === "claude-code") {
      return [
        `# Fill LASTEHR_* in the shell that launches Claude Code. Placeholders only; no secret is printed.`,
        `# ${sandboxGuide(backend).replaceAll("\n", "\n# ")}`,
        `claude mcp add lastehr -- npx -y ${packageSpecifier}`,
        "",
      ].join("\n");
    }
    return `${JSON.stringify(config, null, 2)}\n`;
  }
  if (client === "claude-code") {
    return [
      "# The process inherits MEDPLUM_* variables from your shell or MCP client configuration.",
      "# @lastehr/mcp is read-only unless LASTEHR_MCP_WRITES=proposal is set",
      "# (writes are then elicitation-gated and human-approved per action).",
      `claude mcp add lastehr -- npx -y ${packageSpecifier}`,
      "",
    ].join("\n");
  }

  const config = client === "cursor"
    ? { mcpServers: { lastehr: { type: "stdio", ...mcpConfig.mcpServers.lastehr } } }
    : mcpConfig;
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function isMcpClient(value: string): value is McpClient {
  return value === "json" || value === "claude-code" || value === "cursor";
}
