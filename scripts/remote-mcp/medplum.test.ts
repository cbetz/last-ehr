import { afterEach, describe, expect, it, vi } from "vitest";

import { bootstrapMedplum, createMedplumConfig } from "./medplum";
import type { SyntheticIdentity } from "./types";

const identity = (role: string): SyntheticIdentity => ({
  subject: `${role}-subject`, username: role, password: `synthetic-${role}-password`,
  email: `${role}@example.invalid`, firstName: "Synthetic", lastName: role,
});
const options = {
  baseUrl: "http://127.0.0.1:8103/",
  superadminClientId: "bootstrap-client",
  superadminClientSecret: "bootstrap-secret",
  userInfoUrl: "https://fixture.trycloudflare.com/userinfo",
  writer: identity("writer"), reader: identity("reader"), runId: "synthetic-check",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/fhir+json" },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("disposable Medplum bootstrap", () => {
  it("keeps the production outbound guard enabled and needs no registration or email", () => {
    const config = createMedplumConfig({ ...options, postgresPassword: "local-database-password" });
    expect(config.allowUnsafeOutbound).toBe(false);
    expect(config.registerEnabled).toBe(false);
    expect(config.emailProvider).toBe("none");
    expect(config.port).toBe(8103);
    expect(config.database).toMatchObject({ host: "postgres", username: "medplum", dbname: "medplum" });
    expect(config.redis).toEqual({ host: "redis", port: 6379 });
    expect(config.defaultSuperAdminPassword).toHaveLength(43);
    expect(config.defaultSuperAdminPassword).not.toBe("medplum_admin");
  });

  it("rejects a hosted bootstrap target or a non-HTTPS UserInfo URL before making requests", async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    await expect(bootstrapMedplum({ ...options, baseUrl: "https://api.medplum.com/" })).rejects.toThrow("loopback");
    await expect(bootstrapMedplum({ ...options, userInfoUrl: "http://private-token.local/userinfo" })).rejects.toThrow("public HTTPS");
    await expect(bootstrapMedplum({ ...options, userInfoUrl: "https://localhost/userinfo" })).rejects.toThrow("public HTTPS");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not send credentials or create resources when already cancelled", async () => {
    const abort = new AbortController();
    abort.abort(new Error("PRIVATE_ABORT_REASON"));
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const error = await bootstrapMedplum({ ...options, signal: abort.signal }).catch((error: unknown) => error);
    expect(String(error)).toContain("cancelled");
    expect(String(error)).not.toContain("PRIVATE_ABORT_REASON");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(["fetch", "body"])("cancels a pending %s and removes the parent abort listener", async (stage) => {
    const abort = new AbortController();
    const removeListener = vi.spyOn(abort.signal, "removeEventListener");
    const bodyStarted = vi.fn();
    const cancel = vi.fn();
    const fetchFn = vi.fn<typeof fetch>(async () => stage === "fetch"
      ? new Promise<Response>(() => {})
      : new Response(new ReadableStream({ start() { bodyStarted(); }, cancel })),
    );
    vi.stubGlobal("fetch", fetchFn);
    const pending = bootstrapMedplum({ ...options, signal: abort.signal }).catch((error: unknown) => error);
    if (stage === "body") await vi.waitFor(() => expect(bodyStarted).toHaveBeenCalled());
    abort.abort(new Error("PRIVATE_ABORT_REASON"));
    const error = await pending;
    expect(String(error)).toContain("cancelled");
    expect(String(error)).not.toContain("PRIVATE_ABORT_REASON");
    expect(error).toMatchObject({ code: "medplum_bootstrap_auth" });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    if (stage === "body") expect(cancel).toHaveBeenCalledOnce();
  });

  it("creates separate least-privilege subjects through real API shapes and checks project association", async () => {
    const requests: { path: string; body: Record<string, unknown>; headers: Headers }[] = [];
    let created = 0;
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = path === "/oauth2/token" ? Object.fromEntries(new URLSearchParams(String(init?.body)))
        : JSON.parse(String(init?.body));
      requests.push({ path, body, headers: new Headers(init?.headers) });
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (path === "/oauth2/token") return json({ access_token: "synthetic-admin-token" });
      if (path === "/fhir/R4/Project/$init") return json({ resourceType: "Project", id: "fixture-project" }, 201);
      if (path.endsWith("/invite")) return json({
        resourceType: "ProjectMembership", id: `membership-${body.externalId}`,
        meta: { project: "fixture-project" }, externalId: body.externalId,
        project: { reference: "Project/fixture-project" },
        profile: { reference: `Practitioner/${body.externalId}` },
      });
      return json({ ...body, resourceType: path.endsWith("/client") ? "ClientApplication" : body.resourceType,
        id: `created-${++created}`, meta: { project: "fixture-project" } }, 201);
    });
    vi.stubGlobal("fetch", fetchFn);

    const fixture = await bootstrapMedplum(options);

    expect(fixture.writer).toEqual({ subject: "writer-subject", profileReference: "Practitioner/writer-subject", membershipId: "membership-writer-subject" });
    expect(fixture.reader.subject).toBe("reader-subject");
    expect(fixture.adminAccessToken).toBe("synthetic-admin-token");
    expect(requests[0].body).toEqual({ grant_type: "client_credentials", client_id: "bootstrap-client", client_secret: "bootstrap-secret" });
    expect(requests.slice(1).every(({ headers }) => headers.get("x-medplum") === "extended")).toBe(true);
    expect(requests[1].body).toMatchObject({ resourceType: "Parameters", parameter: [{ name: "name", valueString: "Remote MCP synthetic synthetic-check" }] });
    const policies = requests.filter(({ path }) => path === "/fhir/R4/AccessPolicy");
    expect(policies[0].body.resource).toEqual([
      { resourceType: "Patient", interaction: ["read", "search"] },
      { resourceType: "Observation", interaction: ["read", "search"] },
      { resourceType: "Communication", interaction: ["create", "read", "search"] },
    ]);
    expect(policies[1].body.resource).toEqual([{ resourceType: "Patient", interaction: ["read", "search"] }]);
    const client = requests.find(({ path }) => path.endsWith("/client"))!;
    expect(client.body.identityProvider).toEqual({ userInfoUrl: options.userInfoUrl, useSubject: true });
    const invites = requests.filter(({ path }) => path.endsWith("/invite"));
    expect(invites.map(({ body }) => body.externalId)).toEqual(["writer-subject", "reader-subject"]);
    for (const { body } of invites) {
      expect(body.sendEmail).toBe(false);
      expect(body.admin).toBe(false);
      expect(body).not.toHaveProperty("email");
      expect(body).not.toHaveProperty("password");
    }
    const observation = requests.find(({ path }) => path === "/fhir/R4/Observation")!;
    expect(observation.body.subject).toEqual({ reference: `Patient/${fixture.patientId}` });
    expect(observation.body.valueQuantity).toMatchObject({ value: 72, code: "/min" });
    expect(requests).toHaveLength(9);
  });

  it("withholds malformed JSON, OperationOutcome details, and raw transport errors", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const stdout = vi.spyOn(console, "log").mockImplementation(() => {});
    for (const response of [
      () => new Response("private-patient SECRET_RESPONSE_TOKEN is not JSON"),
      () => json({ resourceType: "OperationOutcome", issue: [{ diagnostics: "SECRET_RESPONSE_TOKEN" }] }),
      () => { throw new Error("http://private.example/?token=SECRET_RESPONSE_TOKEN"); },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => response()));
      const error = await bootstrapMedplum(options).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("diagnostics were withheld");
      expect(String(error)).not.toMatch(/SECRET_RESPONSE_TOKEN|private-patient|private\.example/);
    }
    expect(stderr).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
  });

  it("refuses redirects without following a backend-selected target", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, {
      status: 302, headers: { location: "https://private.example/SECRET_RESPONSE_TOKEN" },
    }));
    vi.stubGlobal("fetch", fetchFn);
    await expect(bootstrapMedplum(options)).rejects.toThrow("HTTP 302");
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("bounds oversized responses and cancels the source body", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel,
    }))));
    await expect(bootstrapMedplum(options)).rejects.toThrow("size limit");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("times out a stalled connection without leaking its error", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<typeof fetch>(async () => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchFn);
    const result = bootstrapMedplum(options).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(String(await result)).toContain("timed out");
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
