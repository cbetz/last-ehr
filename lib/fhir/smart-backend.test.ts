import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { assessSmartAuth } from "./smart-config";
import {
  createSmartBackendServicesTokenSource,
  loadSmartPrivateKey,
} from "./smart-backend";

const TOKEN_URL = "https://auth.example.test/oauth/token";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SMART Backend Services", () => {
  it("signs RS384 with kid, iss=sub, aud, jti, and exp within 5 minutes", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS384", {
      extractable: true,
    });
    const pem = await exportPKCS8(privateKey);
    const bodies: string[] = [];
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(
        JSON.stringify({ access_token: "minted-token", expires_in: 3600 }),
        { status: 200 },
      );
    });
    const token = createSmartBackendServicesTokenSource({
      clientId: "client-1",
      privateKeyPem: pem,
      keyId: "lastehr-epic-1",
      tokenUrl: TOKEN_URL,
      fetch: fetchFn as typeof globalThis.fetch,
    });
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await token();
    const second = await token();
    expect(first).toBe("minted-token");
    expect(second).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(logs).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    const params = new URLSearchParams(bodies[0]);
    expect(params.get("grant_type")).toBe("client_credentials");
    expect(params.get("scope")).toBeNull();
    expect(params.get("client_assertion")).not.toContain(pem);
    const verified = await jwtVerify(
      params.get("client_assertion") as string,
      publicKey,
      { issuer: "client-1", audience: TOKEN_URL },
    );
    expect(verified.payload.sub).toBe("client-1");
    expect(verified.payload.iss).toBe("client-1");
    expect(verified.payload.jti).toEqual(expect.any(String));
    expect(verified.protectedHeader.alg).toBe("RS384");
    expect(verified.protectedHeader.kid).toBe("lastehr-epic-1");
    const exp = verified.payload.exp ?? 0;
    const now = Math.floor(Date.now() / 1000);
    expect(exp - now).toBeLessThanOrEqual(5 * 60);
    expect(exp - (verified.payload.iat ?? 0)).toBeLessThanOrEqual(5 * 60);
  });

  it("sends scope when set and refreshes a token inside the expiry margin", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    let n = 0;
    const fetchFn = vi.fn<typeof globalThis.fetch>(async () => {
      n += 1;
      return new Response(
        JSON.stringify({ access_token: `token-${n}`, expires_in: 30 }),
        { status: 200 },
      );
    });
    const token = createSmartBackendServicesTokenSource({
      clientId: "client-1",
      privateKeyPem: pem,
      scopes: "system/Observation.read system/Observation.write",
      tokenUrl: TOKEN_URL,
      fetch: fetchFn as typeof globalThis.fetch,
    });
    expect(await token()).toBe("token-1");
    expect(await token()).toBe("token-2");
    const body = new URLSearchParams(String(fetchFn.mock.calls[0]?.[1]?.body ?? ""));
    expect(body.get("scope")).toBe(
      "system/Observation.read system/Observation.write",
    );
  });

  it("reads a key path and does not put the PEM or a token echo into errors", async () => {
    const { privateKey } = await generateKeyPair("RS384", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const dir = mkdtempSync(join(tmpdir(), "lastehr-key-"));
    const path = join(dir, "key.pem");
    writeFileSync(path, pem);
    const loaded = loadSmartPrivateKey({
      state: "ready",
      mode: "jwt",
      clientId: "client-1",
      privateKeyPath: path,
    });
    expect(loaded).toContain("BEGIN PRIVATE KEY");
    expect(() =>
      loadSmartPrivateKey({
        state: "ready",
        mode: "jwt",
        clientId: "client-1",
        privateKeyPath: join(dir, "missing.pem"),
      }),
    ).toThrow(/LASTEHR_PRIVATE_KEY_PATH/);
    try {
      loadSmartPrivateKey({
        state: "ready",
        mode: "jwt",
        clientId: "client-1",
        privateKeyPath: join(dir, "missing.pem"),
      });
    } catch (error) {
      expect(String(error)).not.toContain("BEGIN PRIVATE KEY");
      expect(String(error)).not.toContain(pem);
    }

    const fetchFn = vi.fn(
      async () => new Response("echo-secret-token", { status: 401 }),
    );
    const token = createSmartBackendServicesTokenSource({
      clientId: "client-1",
      privateKeyPem: pem,
      tokenUrl: TOKEN_URL,
      fetch: fetchFn as typeof globalThis.fetch,
    });
    await expect(token()).rejects.toThrow("HTTP 401");
    await expect(token()).rejects.not.toThrow(/echo-secret-token|BEGIN PRIVATE KEY/);
  });

  it("treats Oracle scope as required and Epic scope as optional", () => {
    expect(
      assessSmartAuth(
        { LASTEHR_CLIENT_ID: "c", LASTEHR_PRIVATE_KEY: "k" },
        "oracle",
      ),
    ).toMatchObject({ state: "partial" });
    expect(
      assessSmartAuth(
        {
          LASTEHR_CLIENT_ID: "c",
          LASTEHR_PRIVATE_KEY: "k",
          LASTEHR_SCOPES: "system/Observation.read",
        },
        "oracle",
      ).state,
    ).toBe("ready");
    expect(
      assessSmartAuth(
        { LASTEHR_CLIENT_ID: "c", LASTEHR_PRIVATE_KEY: "k" },
        "epic",
      ).state,
    ).toBe("ready");
  });
});
