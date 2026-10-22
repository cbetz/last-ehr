import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildRealm, loginWithPkce, KeycloakLoginError } from "./remote-mcp/keycloak";
import { bootstrapMedplum, createMedplumConfig } from "./remote-mcp/medplum";
import {
  createRuntime, freePort, KEYCLOAK_IMAGE, MEDPLUM_IMAGE, preflight,
  ready, startTunnel, startUserInfoProxy, waitFor,
} from "./remote-mcp/runtime";
import type { SyntheticIdentity, VerificationCheck } from "./remote-mcp/types";
import { verifyRemoteMcp } from "./remote-mcp/verify";
import mcpManifest from "../packages/mcp/package.json";

const exec = promisify(execFile);
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: npm run mcp:remote:verify -- --confirm-synthetic [--report artifacts/remote-mcp/verification.json]");
  console.log("Starts a disposable Keycloak/Medplum stack and a temporary public HTTPS UserInfo tunnel. Always removes its own stack.");
  process.exit(0);
}
const reportIndex = args.indexOf("--report");
const reportPath = reportIndex === -1 ? "artifacts/remote-mcp/verification.json" : args[reportIndex + 1];
const known = new Set(["--confirm-synthetic", "--report", reportPath]);
if (!args.includes("--confirm-synthetic") || !reportPath || args.some(arg => !known.has(arg))) {
  console.error("Pass --confirm-synthetic to create the disposable synthetic stack and its public HTTPS UserInfo endpoint. See --help.");
  process.exit(1);
}

const startedAt = new Date().toISOString();
const runId = randomBytes(6).toString("hex");
const checks: VerificationCheck[] = [];
let stage = "preflight";
let failed = false;
let failureCode: string | undefined;
const closers: Array<() => Promise<void>> = [];
let source = { commit: "unknown", dirty: true };
let recovery: { directory: string; projectName: string } | undefined;
const abort = new AbortController();
let interrupted = false;
function interrupt() {
  if (interrupted) return;
  interrupted = true;
  abort.abort();
  console.error("Stopping verification and removing its owned fixture resources.");
}
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

function identity(role: string): SyntheticIdentity {
  return {
    subject: randomUUID(), username: `${role}-${runId}`,
    password: `Synthetic-Aa1-${randomBytes(24).toString("base64url")}`,
    email: `${role}-${runId}@example.invalid`, firstName: "Synthetic", lastName: role,
  };
}
function progress(value: string) {
  abort.signal.throwIfAborted();
  stage = value;
  console.log(`Remote MCP verification: ${value}`);
}

async function main() {
  try {
    await preflight();
    const commit = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    const dirty = Boolean((await exec("git", ["status", "--porcelain"])).stdout.trim());
    source = { commit, dirty };
    const runtime = await createRuntime(runId);
    recovery = { directory: runtime.directory, projectName: runtime.projectName };
    closers.push(runtime.close);
    const [keycloakPort, medplumPort, callbackPort, mcpPort] = await Promise.all(Array.from({ length: 4 }, () => freePort()));
    if (new Set([keycloakPort, medplumPort, callbackPort, mcpPort]).size !== 4) throw new Error("Port collision");
    const realmName = `lastehr-${runId}`;
    const issuer = `http://127.0.0.1:${keycloakPort}/realms/${realmName}`;
    const medplumBaseUrl = `http://127.0.0.1:${medplumPort}/`;
    const resource = `http://127.0.0.1:${mcpPort}/mcp`;
    const redirectUri = `http://127.0.0.1:${callbackPort}/callback`;
    const writer = identity("writer");
    const reader = identity("reader");

    progress("creating restricted HTTPS UserInfo tunnel");
    const proxy = await startUserInfoProxy(`${issuer}/protocol/openid-connect/userinfo`, runId);
    closers.push(proxy.close);
    const tunnel = await startTunnel(proxy.port, runtime.directory, abort.signal);
    closers.push(tunnel.close);
    const userInfoUrl = `${tunnel.origin}${proxy.path}`;
    await waitFor(() => ready(userInfoUrl, 401), 60_000, abort.signal);
    checks.push({ name: "public HTTPS UserInfo requires a bearer; other IdP endpoints remain local", status: "pass" });

    const superadminClientId = randomUUID();
    const superadminClientSecret = randomBytes(32).toString("hex");
    const postgresPassword = randomBytes(32).toString("hex");
    const realmFile = await runtime.write("realm.json", buildRealm({ realmName, resource, redirectUri, writer, reader }));
    const medplumFile = await runtime.write("medplum.json", createMedplumConfig({
      baseUrl: medplumBaseUrl, postgresPassword, superadminClientId, superadminClientSecret,
    }));
    // The containing directory is 0700. Read-only bind mounts must also be
    // readable by the unprivileged users inside the two application images.
    await chmod(realmFile, 0o644);
    await chmod(medplumFile, 0o644);
    progress("starting pinned disposable Keycloak and Medplum containers");
    await runtime.start({ services: {
      postgres: {
        image: "postgres:15", environment: { POSTGRES_DB: "medplum", POSTGRES_USER: "medplum", POSTGRES_PASSWORD: postgresPassword },
        mem_limit: "512m",
        healthcheck: { test: ["CMD-SHELL", "pg_isready -U medplum -d medplum"], interval: "2s", timeout: "3s", retries: 30 },
        volumes: ["postgres-data:/var/lib/postgresql/data"],
      },
      redis: { image: "redis:7-alpine", mem_limit: "128m", healthcheck: { test: ["CMD", "redis-cli", "ping"], interval: "2s", timeout: "3s", retries: 30 } },
      keycloak: {
        image: KEYCLOAK_IMAGE,
        mem_limit: "1g", environment: { JAVA_OPTS_KC_HEAP: "-Xms128m -Xmx640m" },
        command: ["start-dev", "--features=resource-indicators", "--hostname", `http://127.0.0.1:${keycloakPort}`, "--import-realm"],
        ports: [`127.0.0.1:${keycloakPort}:8080`],
        volumes: [`${realmFile}:/opt/keycloak/data/import/${realmName}-realm.json:ro`],
      },
      medplum: {
        image: MEDPLUM_IMAGE, mem_limit: "1g",
        environment: { NODE_OPTIONS: "--max-old-space-size=768" },
        ports: [`127.0.0.1:${medplumPort}:8103`],
        volumes: [`${medplumFile}:/usr/src/medplum/medplum.config.json:ro`],
        depends_on: { postgres: { condition: "service_healthy" }, redis: { condition: "service_healthy" } },
      },
    }, volumes: { "postgres-data": {} } }, abort.signal);
    await Promise.all([
      waitFor(() => ready(`${issuer}/.well-known/openid-configuration`), 180_000, abort.signal),
      waitFor(() => ready(`${medplumBaseUrl}healthcheck`), 180_000, abort.signal),
    ]);
    checks.push({ name: "real pinned Keycloak and Medplum ready with unsafe outbound disabled", status: "pass" });

    progress("bootstrapping isolated synthetic project and distinct user policies");
    const fixture = await bootstrapMedplum({
      baseUrl: medplumBaseUrl, superadminClientId, superadminClientSecret, userInfoUrl, writer, reader, runId, signal: abort.signal,
    });
    progress("signing two users in through Keycloak authorization code and PKCE");
    const writerTokens = await loginWithPkce({ issuer, resource, redirectUri, identity: writer, signal: abort.signal });
    const readerTokens = await loginWithPkce({ issuer, resource, redirectUri, identity: reader, signal: abort.signal });
    checks.push({ name: "two real Keycloak user logins use authorization code, S256 PKCE and MCP resource audience", status: "pass" });
    try {
      await loginWithPkce({ issuer, resource: `${resource}/unknown`, redirectUri, identity: writer, signal: abort.signal });
      throw new Error("Unknown resource was accepted");
    } catch (error) {
      if (!(error instanceof KeycloakLoginError) || error.code !== "invalid_target") throw error;
    }
    checks.push({ name: "provider rejects an unregistered RFC 8707 resource", status: "pass" });
    progress("verifying real MCP reads, decisions, backend permissions and session isolation");
    checks.push(...await verifyRemoteMcp({
      fixture, issuer, jwksUri: `${issuer}/protocol/openid-connect/certs`, resource, port: mcpPort,
      writerTokens, readerTokens,
      signal: abort.signal,
      issueExpiringTokens: () => loginWithPkce({ issuer, resource, redirectUri, identity: writer, clientId: "lastehr-expiry", signal: abort.signal }),
    }));
    if (proxy.successfulRequests() < 2) throw new Error("Real public UserInfo was not exercised");
    checks.push({ name: "real Medplum exchanges reached the public HTTPS Keycloak UserInfo bridge", status: "pass" });
  } catch (error) {
    failed = true;
    if (interrupted) stage = "interrupted";
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (typeof code === "string" && /^[a-z0-9_-]{1,80}$/i.test(code)) failureCode = code;
    console.error(`Verification failed during ${stage}${failureCode ? ` (${failureCode})` : ""}; credentials and upstream bodies withheld.`);
  } finally {
    for (const close of closers.reverse()) {
      try { await close(); } catch {
        failed = true;
        stage = "cleanup";
        console.error("Owned fixture cleanup failed; inspect only this run's resources.");
        if (recovery) console.error(`Recovery project: ${recovery.projectName}; private configuration directory: ${recovery.directory}`);
      }
    }
    await mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
    await writeFile(reportPath, JSON.stringify({
      schemaVersion: 1, status: failed ? "failed" : "passed", startedAt, finishedAt: new Date().toISOString(), source,
      versions: { keycloak: "26.8.1", medplum: "5.1.35", mcp: mcpManifest.version },
      images: { keycloak: KEYCLOAK_IMAGE, medplum: MEDPLUM_IMAGE },
      dockerProject: `lastehr-remote-${runId}`,
      boundaries: {
        data: "disposable synthetic fixtures", login: "real Keycloak authorization code with S256 PKCE",
        decisions: "scripted SDK elicitation; interactive MCP-host approval UX is not verified",
        transport: "loopback HTTP; deployed public MCP TLS is not verified",
        userInfo: "public HTTPS tunnel to real Keycloak UserInfo only", allowUnsafeOutbound: false,
        hostedMedplum: false, keycloakResourceIndicators: "experimental",
      }, checks, ...(failed ? { failure: { stage, ...(failureCode ? { code: failureCode } : {}) } } : {}),
    }, null, 2) + "\n", { mode: 0o600 });
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  console.log(`Scrubbed verification report: ${reportPath}`);
  process.exitCode = interrupted ? 130 : failed ? 1 : 0;
}

main().catch(() => {
  console.error("Verification could not finish writing its scrubbed report.");
  process.exitCode = 1;
});
