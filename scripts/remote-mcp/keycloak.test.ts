import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { buildRealm, KeycloakLoginError, loginWithPkce } from "./keycloak";
import type { SyntheticIdentity } from "./types";

const writer: SyntheticIdentity = {
  subject: "writer-subject",
  username: "writer",
  password: "disposable-writer-password",
  email: "writer@example.invalid",
  firstName: "Synthetic",
  lastName: "Writer",
};
const reader = { ...writer, subject: "reader-subject", username: "reader", email: "reader@example.invalid" };
const options = {
  realmName: "lastehr-eval-test",
  resource: "http://127.0.0.1:3400/mcp",
  redirectUri: "http://127.0.0.1:49532/callback",
  writer,
  reader,
};

describe("the disposable Keycloak realm contract", () => {
  it("permits only the authorization-code flow with S256 on both public clients", () => {
    const realm = buildRealm(options);
    const clients = realm.clients.filter((client) => "publicClient" in client && client.publicClient);
    expect(clients).toHaveLength(2);
    for (const client of clients) {
      expect(client).toMatchObject({
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: false,
        redirectUris: [options.redirectUri],
        attributes: { "pkce.code.challenge.method": "S256" },
      });
    }
  });

  it("uses a resource client for native indicator validation and isolates the short token lifetime", () => {
    const realm = buildRealm(options);
    const resource = realm.clients.find((client) => client.clientId === "lastehr-mcp-resource");
    expect(resource).toMatchObject({ attributes: { resource_url: options.resource } });
    const main = realm.clients.find((client) => client.clientId === "lastehr-eval");
    const expiry = realm.clients.find((client) => client.clientId === "lastehr-expiry");
    expect(main?.attributes).not.toHaveProperty("access.token.lifespan");
    expect(expiry?.attributes).toHaveProperty("access.token.lifespan", "10");
    expect(JSON.stringify(realm)).not.toContain("included.custom.audience");
  });

  it.each([
    "https://remote.example/callback",
    "http://127.0.0.1:0/callback",
    "http://127.0.0.1:49532/callback?secret=private",
  ])("refuses a callback that is not the exact loopback endpoint", (redirectUri) => {
    expect(() => buildRealm({ ...options, redirectUri })).toThrow(KeycloakLoginError);
  });

  it.each([
    "http://127.0.0.1:3400/mcp#fragment",
    "http://127.0.0.1:3400/mcp?secret=private",
  ])("refuses ambiguous resource indicators before importing a realm", (resource) => {
    expect(() => buildRealm({ ...options, resource })).toThrow(KeycloakLoginError);
  });

  it("rejects a remote callback before discovery or browser startup", async () => {
    await expect(loginWithPkce({
      issuer: "http://127.0.0.1:1/realms/unused",
      resource: options.resource,
      redirectUri: "https://remote.example/callback",
      identity: writer,
    })).rejects.toThrow("callback must use loopback HTTP");
  });

  it("rejects an interrupted login before discovery or browser startup", async () => {
    const controller = new AbortController();
    controller.abort(new Error("PRIVATE_ABORT_REASON"));
    await expect(loginWithPkce({
      issuer: "http://127.0.0.1:1/realms/unused",
      resource: options.resource,
      redirectUri: options.redirectUri,
      identity: writer,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError", code: "ABORT_ERR", message: "Synthetic login interrupted." });
  });

  it("reports a static discovery phase without response bodies or transport diagnostics", async () => {
    const server = createServer((_request, response) => response.end("PRIVATE_PROVIDER_RESPONSE_NOT_JSON"));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const port = (server.address() as { port: number }).port;
      const error = await loginWithPkce({
        issuer: `http://127.0.0.1:${port}/realms/unused`,
        resource: options.resource,
        redirectUri: options.redirectUri,
        identity: writer,
      }).catch((error: unknown) => error);
      expect(error).toMatchObject({ code: "keycloak_discovery_request" });
      expect(String(error)).not.toMatch(/PRIVATE_PROVIDER_RESPONSE|127\.0\.0\.1|SyntaxError/);
      expect(stderr).not.toHaveBeenCalled();
      expect(stdout).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
