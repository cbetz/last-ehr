import { afterEach, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  SignJWT,
  UnsecuredJWT,
  createLocalJWKSet,
  decodeJwt,
  exportJWK,
  generateKeyPair,
  type JWK,
  type CryptoKey,
} from "jose";

import { z } from "zod";

import type { McpRuntimeConfig } from "./config.js";
import { createOAuthTokenVerifier } from "./oauth-verifier.js";
import { READ_TOOL_NAMES } from "./read-tools.js";
import { startRemoteMcpServer, type StartedRemoteMcpServer } from "./remote-server.js";
import type { ExchangedFhirToken } from "./token-exchange.js";
import { MCP_WRITE_TAG, WRITE_TOOL_NAMES, type FhirWriteClient } from "./write-tools.js";

// Loopback end to end, with the real SDK Client over real HTTP on 127.0.0.1:0.
// The verifier is the real one over a local JWKS; the exchange and the FHIR
// client are in-memory; the server's fetch throws so nothing can leave the
// process. These are the proving tests docs/remote-mcp.md demands: a transport
// change to a human-approval path is a claim this project tests, not asserts.

const RESOURCE = "https://mcp.example.test/mcp";
const ISSUER = "https://auth.example.test/";
const FHIR_SERVER = "https://api.medplum.com/";

let privateKey: CryptoKey;
let verifierKeys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = (await exportJWK(pair.publicKey)) as JWK;
  jwk.alg = "RS256";
  jwk.kid = "test-key";
  verifierKeys = createLocalJWKSet({ keys: [jwk] });
});

async function mint(claims: {
  sub?: string;
  client_id?: string;
  aud?: string;
  scope?: string;
  expiresIn?: string;
}): Promise<string> {
  return new SignJWT({
    sub: claims.sub ?? "user-a",
    client_id: claims.client_id ?? "agent-1",
    scope: claims.scope ?? "chart.read",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(claims.aud ?? RESOURCE)
    .setExpirationTime(claims.expiresIn ?? "2h")
    .sign(privateKey);
}

function config(writePolicy: "read-only" | "proposal"): McpRuntimeConfig {
  return {
    backend: "medplum",
    writePolicy,
    writeProvenance: false,
    disabledWriteTools: [],
    transport: "http",
    http: {
      port: 0,
      host: "127.0.0.1",
      resource: RESOURCE,
      issuer: ISSUER,
      jwksUri: "https://unused.test/jwks",
      requiredScopes: ["chart.read"],
      exchangeClientId: "client-with-idp",
      tokenEndpoint: "https://fhir.example.test/oauth2/token",
    },
  };
}

type Rig = {
  server: StartedRemoteMcpServer;
  url: URL;
  exchange: Mock<(callerToken: string) => Promise<ExchangedFhirToken>>;
  createdBy: Map<string, unknown[]>;
  disposals: number;
  log: string[];
  clock: { now: number };
  unauthenticate: () => void;
  /** Requests the DEFAULT MedplumClient factory made, when it is in use. */
  fhirCalls: Array<{ url: string; authorization: string | null }>;
};

const rigs: Rig[] = [];

async function boot(over: {
  writePolicy?: "read-only" | "proposal";
  exchangeTtl?: number;
  limits?: Record<string, number>;
  /**
   * Use the module's real MedplumClient factory instead of the in-memory one.
   * The exchanged token then has to be JWT-shaped (setAccessToken reads exp),
   * and every FHIR call is answered 401 by a recording fetch.
   */
  defaultFactory?: boolean;
} = {}): Promise<Rig> {
  // jose checks exp against the real clock, so the injected clock starts at
  // real time and is advanced from there.
  const clock = { now: Date.now() };
  const createdBy = new Map<string, unknown[]>();
  const log: string[] = [];
  let unauth: () => void = () => {};
  const rig: Rig = {
    server: undefined as never,
    url: undefined as never,
    exchange: vi.fn(async (callerToken: string): Promise<ExchangedFhirToken> => {
      const { sub } = decodeJwt(callerToken);
      const expiresAt = Math.floor(clock.now / 1000) + (over.exchangeTtl ?? 3600);
      return {
        accessToken: over.defaultFactory
          ? new UnsecuredJWT({ sub: String(sub), marker: `fhir-for-${String(sub)}` })
              .setExpirationTime(expiresAt)
              .encode()
          : `fhir-for-${String(sub)}`,
        expiresAt,
        profile: `Practitioner/${String(sub)}`,
      };
    }),
    createdBy,
    disposals: 0,
    log,
    clock,
    unauthenticate: () => unauth(),
    fhirCalls: [],
  };
  rig.server = await startRemoteMcpServer({
    config: config(over.writePolicy ?? "read-only"),
    port: 0,
    verifier: createOAuthTokenVerifier(
      { resource: RESOURCE, issuer: ISSUER, jwksUri: "https://unused.test/jwks", requiredScopes: ["chart.read"] },
      verifierKeys,
    ),
    exchange: rig.exchange,
    fetchImpl: over.defaultFactory
      ? async (input, init) => {
          rig.fhirCalls.push({
            url: String(input instanceof Request ? input.url : input),
            authorization: new Headers(init?.headers).get("authorization"),
          });
          return new Response(JSON.stringify({ resourceType: "OperationOutcome" }), {
            status: 401,
            headers: { "content-type": "application/fhir+json" },
          });
        }
      : async () => {
          throw new Error("network reached");
        },
    createFhirClient: over.defaultFactory ? undefined : (exchanged, hooks) => {
      // One array per exchanged token, shared across sessions for the same
      // caller, so a later session cannot shadow an earlier write in assertions.
      const created = createdBy.get(exchanged.accessToken) ?? [];
      createdBy.set(exchanged.accessToken, created);
      unauth = hooks.onUnauthenticated;
      const client: FhirWriteClient = {
        async search() {
          return {
            resourceType: "Bundle",
            type: "searchset",
            entry: [
              {
                resource: {
                  resourceType: "Patient",
                  id: `patient-of-${exchanged.accessToken}`,
                  name: [{ family: "Garcia", given: ["Maria"] }],
                },
              },
            ],
          } as never;
        },
        async searchResources() {
          return [] as never;
        },
        async createResource(resource) {
          const stored = { ...resource, id: `created-${created.length + 1}` };
          created.push(stored);
          return stored;
        },
      };
      return {
        client,
        dispose: () => {
          rig.disposals += 1;
        },
      };
    },
    now: () => clock.now,
    sessionIdGenerator: (() => {
      let n = 0;
      return () => `s-${++n}`;
    })(),
    log: (line) => log.push(line),
    limits: over.limits,
  });
  rig.url = new URL(`http://127.0.0.1:${rig.server.address.port}/mcp`);
  rigs.push(rig);
  return rig;
}

afterEach(async () => {
  for (const rig of rigs.splice(0)) await rig.server.close();
});

type ConnectOptions = {
  token: string;
  elicitation?: boolean;
  onElicit?: (message: string) => Promise<{ action: "accept" | "decline"; approve?: boolean }>;
  fetch?: typeof fetch;
};

async function connect(rig: Rig, o: ConnectOptions) {
  const client = new Client(
    { name: "remote-e2e", version: "0" },
    { capabilities: o.elicitation ? { elicitation: {} } : {} },
  );
  if (o.elicitation) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      const answer = await (o.onElicit ?? (async () => ({ action: "accept" as const, approve: true })))(
        req.params.message,
      );
      return answer.action === "accept"
        ? { action: "accept" as const, content: { approve: answer.approve ?? false } }
        : { action: "decline" as const };
    });
  }
  const transport = new StreamableHTTPClientTransport(rig.url, {
    requestInit: { headers: { authorization: `Bearer ${o.token}` } },
    fetch: o.fetch,
  });
  await client.connect(transport);
  return { client, transport };
}

/** Raw request with the headers the SDK client would send. */
async function raw(
  rig: Rig,
  o: { method?: string; token?: string; sessionId?: string; body?: unknown; extraHeaders?: Record<string, string> },
) {
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
    ...(o.sessionId ? { "mcp-session-id": o.sessionId } : {}),
    ...o.extraHeaders,
  };
  return fetch(rig.url, {
    method: o.method ?? "POST",
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
}

const toolNames = async (client: Client) => (await client.listTools()).tools.map((t) => t.name).sort();
const text = (result: unknown) =>
  (result as { content: Array<{ text: string }> }).content[0]?.text ?? "";

describe("remote MCP over HTTP: the write path", () => {
  it("PROVING TEST 1: an elicitation-capable client is offered the write tools, and an approval over HTTP commits the write, tagged", async () => {
    const rig = await boot({ writePolicy: "proposal" });
    const prompts: string[] = [];
    const token = await mint({ sub: "user-a" });
    const { client } = await connect(rig, {
      token,
      elicitation: true,
      onElicit: async (m) => {
        prompts.push(m);
        return { action: "accept", approve: true };
      },
    });

    expect(await toolNames(client)).toEqual([...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES].sort());

    const result = await client.callTool({
      name: "add_note",
      arguments: { patientId: "p1", text: "Remote approval e2e" },
    });
    expect(JSON.parse(text(result))).toMatchObject({ saved: true });
    // The elicitation travelled server->client on the tools/call stream and
    // the answer came back as an authenticated POST.
    expect(prompts).toHaveLength(1);
    const created = rig.createdBy.get("fhir-for-user-a") ?? [];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      resourceType: "Communication",
      meta: { tag: expect.arrayContaining([expect.objectContaining(MCP_WRITE_TAG)]) },
    });

    // A denial saves nothing; a decline saves nothing; a throwing handler
    // (transport-level unavailability) saves nothing.
    for (const onElicit of [
      async () => ({ action: "accept" as const, approve: false }),
      async () => ({ action: "decline" as const }),
      async (): Promise<never> => {
        throw new Error("host cannot render");
      },
    ]) {
      const other = await connect(rig, { token: await mint({ sub: "user-a" }), elicitation: true, onElicit });
      const r = await other.client.callTool({ name: "add_note", arguments: { patientId: "p1", text: "x" } });
      expect(JSON.parse(text(r))).toMatchObject({ saved: false });
    }
    expect(rig.createdBy.get("fhir-for-user-a")).toHaveLength(1);
  });

  // Found by adversarial review: the approval used to ride the standalone GET
  // stream, so a host that never opened one never saw the prompt and every
  // write failed closed after the request timeout. The elicitation now carries
  // relatedRequestId and rides the tools/call's own stream.
  it("PROVING TEST 1b: the approval reaches a host that never opens the standalone GET stream", async () => {
    const rig = await boot({ writePolicy: "proposal" });
    const noGet: typeof fetch = async (input, init) =>
      init?.method === "GET" ? new Response(null, { status: 405 }) : fetch(input, init);
    const prompts: string[] = [];
    const { client } = await connect(rig, {
      token: await mint({ sub: "user-g" }),
      elicitation: true,
      fetch: noGet,
      onElicit: async (m) => {
        prompts.push(m);
        return { action: "accept", approve: true };
      },
    });
    const result = await client.callTool({
      name: "add_note",
      arguments: { patientId: "p1", text: "approval without a GET stream" },
    });
    expect(JSON.parse(text(result))).toMatchObject({ saved: true });
    expect(prompts).toHaveLength(1);
    expect(rig.createdBy.get("fhir-for-user-g")).toHaveLength(1);
  });

  it("PROVING TEST 2: a client without the elicitation capability is offered no write tool, and calling one creates nothing", async () => {
    const rig = await boot({ writePolicy: "proposal" });
    const bare = await connect(rig, { token: await mint({ sub: "user-b" }), elicitation: false });
    expect(await toolNames(bare.client)).toEqual([...READ_TOOL_NAMES].sort());

    const r = await bare.client.callTool({ name: "add_note", arguments: { patientId: "p1", text: "x" } });
    expect((r as { isError?: boolean }).isError).toBe(true);
    expect(text(r)).toContain("Unknown tool: add_note");
    expect(rig.createdBy.get("fhir-for-user-b") ?? []).toHaveLength(0);

    // The gate is per session, not per process: a capable client alongside it
    // does see the write tools.
    const capable = await connect(rig, { token: await mint({ sub: "user-c" }), elicitation: true });
    expect(await toolNames(capable.client)).toContain("add_note");
  });

  it("under the default read-only policy no client is offered a write tool", async () => {
    const rig = await boot({ writePolicy: "read-only" });
    const capable = await connect(rig, { token: await mint({}), elicitation: true });
    const bare = await connect(rig, { token: await mint({ sub: "user-b" }), elicitation: false });
    expect(await toolNames(capable.client)).toEqual([...READ_TOOL_NAMES].sort());
    expect(await toolNames(bare.client)).toEqual([...READ_TOOL_NAMES].sort());
  });
});

describe("remote MCP over HTTP: credentials", () => {
  it("exchanges once per session with the caller's own token, and never again across calls", async () => {
    const rig = await boot();
    const token = await mint({ sub: "user-a" });
    const { client, transport } = await connect(rig, { token });
    expect(transport.sessionId).toBe("s-1");
    await client.listTools();
    await client.callTool({ name: "search_patients", arguments: { name: "Garcia" } });
    await client.callTool({ name: "search_patients", arguments: { name: "Garcia" } });
    expect(rig.exchange).toHaveBeenCalledTimes(1);
    expect(rig.exchange.mock.calls[0][0]).toBe(token);
  });

  it("gives each session its own caller's exchanged FHIR token", async () => {
    const rig = await boot();
    const a = await connect(rig, { token: await mint({ sub: "user-a" }) });
    const b = await connect(rig, { token: await mint({ sub: "user-b" }) });
    const ra = text(await a.client.callTool({ name: "search_patients", arguments: { name: "Garcia" } }));
    const rb = text(await b.client.callTool({ name: "search_patients", arguments: { name: "Garcia" } }));
    expect(ra).toContain("patient-of-fhir-for-user-a");
    expect(rb).toContain("patient-of-fhir-for-user-b");
    expect(ra).not.toContain("user-b");
  });

  it("verifies the bearer on every request after initialization", async () => {
    const rig = await boot();
    const token = await mint({ sub: "user-a" });
    const { client, transport } = await connect(rig, { token });
    const sessionId = transport.sessionId as string;
    const list = { jsonrpc: "2.0", id: 9, method: "tools/list" };

    const none = await raw(rig, { sessionId, body: list });
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toContain("resource_metadata=");

    const expired = await raw(rig, { sessionId, body: list, token: await mint({ sub: "user-a", expiresIn: "-1m" }) });
    expect(expired.status).toBe(401);

    // The confused-deputy case from the probe, now proven at the transport
    // boundary: a valid, correctly signed token addressed to the FHIR server.
    const medplum = await raw(rig, { sessionId, body: list, token: await mint({ sub: "user-a", aud: FHIR_SERVER }) });
    expect(medplum.status).toBe(401);

    const noScope = await raw(rig, { sessionId, body: list, token: await mint({ sub: "user-a", scope: "profile" }) });
    expect(noScope.status).toBe(403);

    // The legitimate client is unaffected, and nothing above caused an exchange.
    await client.listTools();
    expect(rig.exchange).toHaveBeenCalledTimes(1);
  });
});

describe("remote MCP over HTTP: session binding", () => {
  it("binds the session to the caller who opened it: a second caller cannot POST into, attach to, DELETE, or answer an approval in it", async () => {
    const rig = await boot({ writePolicy: "proposal" });
    const tokenA = await mint({ sub: "user-a" });
    const tokenB = await mint({ sub: "user-b" });

    // A opens a session and starts a write that will wait on approval. The
    // test proceeds only once the elicitation is really pending, and it learns
    // the elicitation's real id from the wire rather than assuming one.
    let releaseA: (() => void) | undefined;
    let markElicited: (() => void) | undefined;
    const elicited = new Promise<void>((r) => {
      markElicited = r;
    });
    const a = await connect(rig, {
      token: tokenA,
      elicitation: true,
      onElicit: async () => {
        markElicited?.();
        await new Promise<void>((r) => {
          releaseA = r;
        });
        return { action: "decline" };
      },
    });
    let elicitId: unknown;
    const passThrough = a.transport.onmessage;
    a.transport.onmessage = (message: JSONRPCMessage) => {
      const m = message as { method?: string; id?: unknown };
      if (m.method === "elicitation/create") elicitId = m.id;
      passThrough?.(message);
    };
    const sessionId = a.transport.sessionId as string;
    const pendingWrite = a.client.callTool({ name: "add_note", arguments: { patientId: "p1", text: "hijack target" } });
    await elicited;
    expect(elicitId).toBeDefined();

    const list = { jsonrpc: "2.0", id: 9, method: "tools/list" };
    const unknownBody = await (await raw(rig, { sessionId: "not-a-real-session", body: list, token: tokenB })).text();

    const post = await raw(rig, { sessionId, body: list, token: tokenB });
    expect(post.status).toBe(404);
    expect(await post.text()).toBe(unknownBody);

    const get = await fetch(rig.url, {
      method: "GET",
      headers: { accept: "text/event-stream", authorization: `Bearer ${tokenB}`, "mcp-session-id": sessionId },
    });
    expect(get.status).toBe(404);

    const del = await raw(rig, { method: "DELETE", sessionId, token: tokenB });
    expect(del.status).toBe(404);
    expect(rig.server.handler.sessionCount()).toBe(1);

    // A fabricated approval answer from B into A's session, using the real
    // pending elicitation id.
    const forged = await raw(rig, {
      sessionId,
      token: tokenB,
      body: { jsonrpc: "2.0", id: elicitId, result: { action: "accept", content: { approve: true } } },
    });
    expect(forged.status).toBe(404);

    // A's own answer (decline) is the one that lands: nothing saved.
    releaseA?.();
    expect(JSON.parse(text(await pendingWrite))).toMatchObject({ saved: false });
    expect(rig.createdBy.get("fhir-for-user-a") ?? []).toHaveLength(0);
    // B never obtained a FHIR client: no exchange for B, no session for B.
    expect(rig.createdBy.has("fhir-for-user-b")).toBe(false);
  });

  it("treats the same subject through a different client_id as a different caller", async () => {
    const rig = await boot();
    const a = await connect(rig, { token: await mint({ sub: "user-a", client_id: "agent-1" }) });
    const other = await mint({ sub: "user-a", client_id: "agent-2" });
    const r = await raw(rig, { sessionId: a.transport.sessionId, token: other, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(r.status).toBe(404);
  });

  it("keeps the session across a token refresh for the same subject and client", async () => {
    const rig = await boot();
    let current = await mint({ sub: "user-a" });
    const rotating: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("authorization", `Bearer ${current}`);
      return fetch(input, { ...init, headers });
    };
    const { client } = await connect(rig, { token: current, fetch: rotating });
    await client.listTools();
    current = await mint({ sub: "user-a" }); // new jti, later exp, same principal
    await client.listTools();
    expect(rig.exchange).toHaveBeenCalledTimes(1);
  });

  it("refuses an initialize that carries someone else's session id, and the owner cannot re-initialize", async () => {
    const rig = await boot();
    const a = await connect(rig, { token: await mint({ sub: "user-a" }) });
    const sessionId = a.transport.sessionId as string;
    const init = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "0" } },
    };
    const foreign = await raw(rig, { sessionId, token: await mint({ sub: "user-b" }), body: init });
    expect(foreign.status).toBe(404);
    const owner = await raw(rig, { sessionId, token: await mint({ sub: "user-a" }), body: init });
    expect(owner.status).toBe(400);
    expect(await owner.text()).toContain("already initialized");
    expect(rig.server.handler.sessionCount()).toBe(1);
  });

  it("lets only the owner DELETE, and disposes the credential", async () => {
    const rig = await boot();
    const a = await connect(rig, { token: await mint({ sub: "user-a" }) });
    const sessionId = a.transport.sessionId as string;
    await a.transport.terminateSession();
    expect(rig.server.handler.sessionCount()).toBe(0);
    expect(rig.disposals).toBe(1);
    const after = await raw(rig, { sessionId, token: await mint({ sub: "user-a" }), body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(after.status).toBe(404);
    expect(rig.log.join("\n")).toContain("reason=delete");
  });
});

describe("remote MCP over HTTP: credential lifetime", () => {
  it("stops serving when the exchanged FHIR token expires, and re-exchanges on re-initialize", async () => {
    const rig = await boot({ exchangeTtl: 60 });
    const token = await mint({ sub: "user-a" });
    const { client } = await connect(rig, { token });
    await client.listTools();
    // Inside the 30 s skew of a 60 s credential.
    rig.clock.now += 31_000;
    await expect(client.callTool({ name: "search_patients", arguments: { name: "x" } })).rejects.toMatchObject({
      code: 404,
      message: expect.stringContaining("Session not found"),
    });
    expect(rig.server.handler.sessionCount()).toBe(0);
    expect(rig.disposals).toBe(1);
    const fresh = await connect(rig, { token });
    await fresh.client.listTools();
    expect(rig.exchange).toHaveBeenCalledTimes(2);
  });

  it("stops serving when the FHIR backend answers unauthorized", async () => {
    const rig = await boot();
    const { client, transport } = await connect(rig, { token: await mint({ sub: "user-a" }) });
    rig.unauthenticate();
    const r = await raw(rig, { sessionId: transport.sessionId, token: await mint({ sub: "user-a" }), body: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(r.status).toBe(404);
    expect(rig.log.join("\n")).toContain("reason=revoked");
    expect(rig.server.handler.sessionCount()).toBe(0);
    void client;
  });

  it("a session torn down mid-approval saves nothing, even after the reviewer answers late", async () => {
    const rig = await boot({ writePolicy: "proposal", exchangeTtl: 60 });
    let release: (() => void) | undefined;
    let markElicited: (() => void) | undefined;
    const elicited = new Promise<void>((r) => {
      markElicited = r;
    });
    const { client } = await connect(rig, {
      token: await mint({ sub: "user-a" }),
      elicitation: true,
      onElicit: async () => {
        markElicited?.();
        await new Promise<void>((r) => {
          release = r;
        });
        return { action: "accept", approve: true };
      },
    });
    const pending = client.callTool({ name: "add_note", arguments: { patientId: "p1", text: "late" } });
    await elicited;
    // Past the credential deadline: sweep tears the session down under the
    // pending approval.
    rig.clock.now += 31_000;
    expect(await rig.server.handler.sweep()).toBe(1);
    expect(rig.disposals).toBe(1);
    expect(rig.server.handler.sessionCount()).toBe(0);
    // The client can no longer receive the outcome — its stream was closed
    // under it — so the only acceptable client-side states are "rejected" or
    // "still waiting"; never a saved:true.
    const outcome = await Promise.race([
      pending.then(
        (r) => (JSON.parse(text(r)) as { saved?: boolean }).saved === true ? "saved" : "not-saved",
        () => "rejected",
      ),
      new Promise<string>((r) => setTimeout(() => r("still-pending"), 300)),
    ]);
    expect(outcome).not.toBe("saved");
    // The reviewer's late approval lands on a closed session: still nothing.
    release?.();
    await new Promise((r) => setTimeout(r, 100));
    expect(rig.createdBy.get("fhir-for-user-a") ?? []).toHaveLength(0);
  });

  it("with the real MedplumClient factory, FHIR calls go to the token endpoint's origin with the exchanged token, and a 401 revokes the session", async () => {
    const rig = await boot({ defaultFactory: true });
    const token = await mint({ sub: "user-a" });
    const { client, transport } = await connect(rig, { token });
    const r = await client.callTool({ name: "search_patients", arguments: { name: "Garcia" } });
    // The tool failed closed with the package's generic text, not a stack.
    expect(text(r)).not.toContain("fhir-for-");
    expect(rig.fhirCalls.length).toBeGreaterThan(0);
    for (const call of rig.fhirCalls) {
      expect(call.url.startsWith("https://fhir.example.test/")).toBe(true);
      expect(call.authorization ?? "").not.toContain(token);
      // The exchanged token, not the caller's: its payload carries the marker.
      const bearer = (call.authorization ?? "").replace(/^Bearer /, "");
      expect((decodeJwt(bearer) as { marker?: string }).marker).toBe("fhir-for-user-a");
    }
    // handleUnauthenticated fired the hook: the next request is refused and
    // the log names the reason.
    const next = await raw(rig, {
      sessionId: transport.sessionId,
      token: await mint({ sub: "user-a" }),
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(next.status).toBe(404);
    expect(rig.log.join("\n")).toContain("reason=revoked");
  });

  it("delivers a real 413 for an oversize body on both the initialize and the session path", async () => {
    const rig = await boot({ limits: { maxBodyBytes: 512 } });
    const token = await mint({ sub: "user-a" });
    const big = "x".repeat(4096);
    const init = await fetch(rig.url, {
      method: "POST",
      headers: { accept: "application/json, text/event-stream", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: big,
    });
    expect(init.status).toBe(413);
    expect(rig.exchange).not.toHaveBeenCalled();

    const { client, transport } = await connect(rig, { token });
    const inSession = await fetch(rig.url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "mcp-session-id": transport.sessionId as string,
      },
      body: big,
    });
    expect(inSession.status).toBe(413);
    // The owner's session is intact.
    await client.listTools();
  });

  it("reaps idle sessions without traffic", async () => {
    const rig = await boot({ limits: { idleTimeoutMs: 1000 } });
    await connect(rig, { token: await mint({ sub: "user-a" }) });
    rig.clock.now += 1001;
    expect(await rig.server.handler.sweep()).toBe(1);
    expect(rig.server.handler.sessionCount()).toBe(0);
  });

  it("caps sessions per caller and overall with 503, and never evicts", async () => {
    const rig = await boot({ limits: { maxSessionsPerPrincipal: 1, maxSessions: 2 } });
    const a = await connect(rig, { token: await mint({ sub: "user-a" }) });
    await expect(connect(rig, { token: await mint({ sub: "user-a" }) })).rejects.toMatchObject({
      code: 503,
      message: expect.stringContaining("Too many sessions"),
    });
    await connect(rig, { token: await mint({ sub: "user-b" }) });
    await expect(connect(rig, { token: await mint({ sub: "user-c" }) })).rejects.toMatchObject({
      code: 503,
    });
    await a.client.listTools();
    expect(rig.server.handler.sessionCount()).toBe(2);
  });
});

describe("remote MCP over HTTP: surface", () => {
  it("serves the metadata document unauthenticated and 404s unknown paths without consulting the verifier", async () => {
    const rig = await boot();
    const meta = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", rig.url));
    expect(meta.status).toBe(200);
    expect(await meta.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [ISSUER] });
    const unknown = await fetch(new URL("/health", rig.url));
    expect(unknown.status).toBe(404);
  });

  it("keeps the caller's bearer out of tool-handler scope", async () => {
    // The SDK builds extra.requestInfo.headers from every request header, and
    // @hono/node-server builds those from IncomingMessage.rawHeaders. This pins
    // the rawHeaders strip end to end: a handler on this session's Server sees
    // an empty token and no authorization header at all.
    const rig = await boot();
    const token = await mint({ sub: "user-a" });
    const { client } = await connect(rig, { token });
    const session = rig.server.handler.registry.values()[0];
    const EchoRequest = z.object({
      method: z.literal("test/echo"),
      params: z.object({}).passthrough().optional(),
    });
    const EchoResult = z.object({
      token: z.string().optional(),
      headerNames: z.array(z.string()),
    });
    session.server.setRequestHandler(EchoRequest, async (_req, extra) => ({
      token: extra.authInfo?.token,
      headerNames: Object.keys(extra.requestInfo?.headers ?? {}).map((h) => h.toLowerCase()),
    }));
    const echoed = await client.request({ method: "test/echo", params: {} }, EchoResult);
    expect(echoed.token).toBe("");
    expect(echoed.headerNames).not.toContain("authorization");
    expect(echoed.headerNames).toContain("mcp-session-id");
  });

  it("across the file, no log line contains an issued token or a raw session id", async () => {
    const rig = await boot({ writePolicy: "proposal" });
    const token = await mint({ sub: "user-a" });
    const { client, transport } = await connect(rig, { token, elicitation: true });
    await client.callTool({ name: "add_note", arguments: { patientId: "p1", text: "x" } });
    await raw(rig, { sessionId: transport.sessionId, body: {}, token: await mint({ sub: "user-b" }) });
    const all = rig.log.join("\n");
    expect(all).not.toContain(token);
    expect(all).not.toContain("fhir-for-");
    expect(all).not.toContain(transport.sessionId as string);
    expect(all).toContain("session opened");
  });
});
