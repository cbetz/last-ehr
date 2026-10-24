import { chmodSync, linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { hostedWorkAuthConfig, parseHostedWorkConfig, readHostedWorkConfig } from "./hosted-config";

const config = {
  schemaVersion: 1, syntheticOnly: true, publicOrigin: "https://work.example.test",
  storePath: "/private/last-work/work.sqlite",
  issuer: "https://identity.example.test/realms/last",
  jwksUri: "https://identity.example.test/realms/last/certs",
  authorizationEndpoint: "https://identity.example.test/realms/last/authorize",
  tokenEndpoint: "https://identity.example.test/realms/last/token",
  reviewerSubject: "reviewer-identity", reviewerClientId: "last-reviewer", reviewerClientSecret: "private-secret-not-for-diagnostics",
  assistantIdentities: [{ clientId: "grok-pilot", subject: "assistant-one" }, { clientId: "claude-pilot", subject: "assistant-two" }],
};
const directories: string[] = [];
const invalid = "Hosted Work configuration is invalid. Use the documented synthetic-only schema and HTTPS identity endpoints.";
const unreadable = "Hosted Work requires a readable, private configuration file (0600 or 0400). Configuration details were withheld.";

function fixture(contents: unknown = config, mode = 0o600) {
  const directory = mkdtempSync(join(tmpdir(), "last-hosted-config-"));
  directories.push(directory);
  chmodSync(directory, 0o700);
  const path = join(directory, "work.json");
  writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents), { mode });
  chmodSync(path, mode);
  return { directory, path };
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true }); });

describe("hosted synthetic Work operator configuration", () => {
  it("accepts an explicit synthetic service and applies bounded listener/private-backend defaults", () => {
    expect(parseHostedWorkConfig(config)).toEqual({ ...config, listenHost: "127.0.0.1", listenPort: 3400, hapiUrl: "http://hapi:8080/fhir" });
    expect(parseHostedWorkConfig({ ...config, listenHost: "0.0.0.0", listenPort: 65535 })).toMatchObject({ listenHost: "0.0.0.0", listenPort: 65535 });
  });

  it("derives exact MCP audience and reviewer callback from the fixed HTTPS origin", () => {
    expect(hostedWorkAuthConfig(parseHostedWorkConfig(config))).toEqual({
      issuer: config.issuer, jwksUri: config.jwksUri, resource: "https://work.example.test/mcp", tenantId: "synthetic-work-lab",
      assistantIdentities: config.assistantIdentities,
      reviewer: { subject: config.reviewerSubject, clientId: config.reviewerClientId, clientSecret: config.reviewerClientSecret,
        authorizationEndpoint: config.authorizationEndpoint, tokenEndpoint: config.tokenEndpoint, redirectUri: "https://work.example.test/auth/callback" },
    });
  });

  it.each([
    "http://work.example.test", "https://work.example.test/", "https://work.example.test/path", "https://work.example.test?token=secret",
    "https://work.example.test#fragment", "https://user:password@work.example.test", "https://WORK.example.test", "https://work.example.test:443",
  ])("rejects ambiguous or non-HTTPS public origin %s", (publicOrigin) => {
    expect(() => parseHostedWorkConfig({ ...config, publicOrigin })).toThrow(invalid);
  });

  it("requires HTTPS identity endpoints on the explicitly configured issuer origin", () => {
    for (const field of ["issuer", "jwksUri", "authorizationEndpoint", "tokenEndpoint"] as const) {
      for (const value of ["http://identity.example.test/endpoint", "https://user:password@identity.example.test/endpoint", "https://identity.example.test/endpoint?secret=value", "https://identity.example.test/endpoint#fragment", "not-a-url"]) {
        expect(() => parseHostedWorkConfig({ ...config, [field]: value })).toThrow(invalid);
      }
    }
    for (const field of ["jwksUri", "authorizationEndpoint", "tokenEndpoint"] as const) {
      expect(() => parseHostedWorkConfig({ ...config, [field]: "https://foreign-identity.example.test/endpoint" })).toThrow(invalid);
    }
  });

  it("rejects unknown fields and attempts to change the synthetic/backend contract", () => {
    for (const change of [
      { schemaVersion: 2 }, { syntheticOnly: false }, { tenantId: "someone-else" }, { resource: "https://foreign.example.test/mcp" },
      { hapiUrl: "http://127.0.0.1:8080/fhir" }, { hapiUrl: "https://clinical.example.test/fhir" }, { hapiUrl: "http://hapi:8080/fhir/" },
      { assistantIdentities: [{ ...config.assistantIdentities[0], role: "reviewer" }] },
    ]) expect(() => parseHostedWorkConfig({ ...config, ...change })).toThrow(invalid);
  });

  it("requires a canonical absolute persistent store path", () => {
    for (const storePath of ["", "work.sqlite", "./work.sqlite", "/private/last/../work.sqlite", "/private/last/work.sqlite/"]) {
      expect(() => parseHostedWorkConfig({ ...config, storePath })).toThrow(invalid);
    }
    const file = fixture();
    const storePath = join(file.directory, "work.sqlite");
    expect(parseHostedWorkConfig({ ...config, storePath }).storePath).toBe(storePath);
  });

  it("bounds listener configuration and preserves a fixed private HAPI service", () => {
    for (const change of [{ listenHost: "localhost" }, { listenHost: "::" }, { listenPort: 80 }, { listenPort: 65536 }, { listenPort: 3400.5 }, { listenPort: "3400" }]) {
      expect(() => parseHostedWorkConfig({ ...config, ...change })).toThrow(invalid);
    }
  });

  it("rejects duplicate assistant identities and reviewer raw subject under every assistant client", () => {
    expect(() => parseHostedWorkConfig({ ...config, assistantIdentities: [config.assistantIdentities[0], config.assistantIdentities[0]] })).toThrow(invalid);
    expect(() => parseHostedWorkConfig({ ...config, assistantIdentities: [{ clientId: "different-client", subject: config.reviewerSubject }] })).toThrow(invalid);
    // One user can legitimately authorize two different external clients.
    expect(parseHostedWorkConfig({ ...config, assistantIdentities: [{ clientId: "one", subject: "same-user" }, { clientId: "two", subject: "same-user" }] }).assistantIdentities).toHaveLength(2);
  });

  it("bounds identity lists and rejects missing, empty, oversized and control-bearing credentials", () => {
    for (const assistantIdentities of [[], Array.from({ length: 257 }, (_, index) => ({ clientId: `client-${index}`, subject: "user" })), [{ clientId: "", subject: "user" }], [{ clientId: "client", subject: "" }], [{ clientId: "client", subject: "user\nreviewer" }]]) {
      expect(() => parseHostedWorkConfig({ ...config, assistantIdentities })).toThrow(invalid);
    }
    for (const change of [{ reviewerSubject: "" }, { reviewerClientId: "" }, { reviewerSubject: "x".repeat(513) }, { reviewerClientId: "client\u0000id" }, { reviewerClientSecret: "" }, { reviewerClientSecret: "x".repeat(4097) }]) {
      expect(() => parseHostedWorkConfig({ ...config, ...change })).toThrow(invalid);
    }
    expect(parseHostedWorkConfig({ ...config, reviewerClientSecret: undefined }).reviewerClientSecret).toBeUndefined();
  });
});

describe("hosted Work private configuration files", () => {
  it.each([0o600, 0o400])("reads an ordinary private file with mode %s", (mode) => {
    expect(readHostedWorkConfig(fixture(config, mode).path)).toMatchObject(config);
  });

  it.each([0o644, 0o640, 0o604, 0o660, 0o606])("rejects a file readable/writable by another identity with mode %s", (mode) => {
    expect(() => readHostedWorkConfig(fixture(config, mode).path)).toThrow(unreadable);
  });

  it("rejects symlinks, hard links, directories and missing files", () => {
    const file = fixture();
    const symbolic = join(file.directory, "symbolic.json"); symlinkSync(file.path, symbolic);
    expect(() => readHostedWorkConfig(symbolic)).toThrow(unreadable);
    const hard = join(file.directory, "hard.json"); linkSync(file.path, hard);
    expect(() => readHostedWorkConfig(hard)).toThrow(unreadable);
    expect(() => readHostedWorkConfig(file.path)).toThrow(unreadable);
    const directory = join(file.directory, "directory"); mkdirSync(directory, { mode: 0o700 });
    expect(() => readHostedWorkConfig(directory)).toThrow(unreadable);
    expect(() => readHostedWorkConfig(join(file.directory, "missing.json"))).toThrow(unreadable);
  });

  it("rejects oversized, malformed and invalid configuration without exposing paths or secrets", () => {
    for (const value of ["x".repeat(64 * 1024 + 1), '{"reviewerClientSecret":"private-secret-not-for-diagnostics",', { ...config, syntheticOnly: false }]) {
      const { path } = fixture(value);
      let message = "";
      try { readHostedWorkConfig(path); } catch (error) { message = (error as Error).message; }
      expect(message).toBe(unreadable);
      expect(message).not.toContain(path);
      expect(message).not.toContain(config.reviewerClientSecret);
    }
  });
});
