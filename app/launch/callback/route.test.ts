import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { jar, cookieSets, deleted } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  cookieSets: [] as Array<{
    name: string;
    value: string;
    options: { httpOnly?: boolean; secure?: boolean; maxAge?: number };
  }>,
  deleted: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    delete: (name: string) => {
      deleted.push(name);
      jar.delete(name);
    },
    set: (
      name: string,
      value: string,
      options: { httpOnly?: boolean; secure?: boolean; maxAge?: number },
    ) => {
      cookieSets.push({ name, value, options });
      jar.set(name, value);
    },
  }),
}));

import { GET } from "./route";

const credentialCanary = "synthetic-oauth-credential-canary";
const codeCanary = "synthetic-authorization-code-canary";
const verifierCanary = "synthetic-pkce-verifier-canary";

function callback(query = `code=${codeCanary}&state=expected-state`): Request {
  return new Request(`https://last.example/launch/callback?${query}`, {
    headers: { host: "last.example", "x-forwarded-proto": "https" },
  });
}

describe("SMART launch callback", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    jar.clear();
    cookieSets.length = 0;
    deleted.length = 0;
    jar.set("smart_state", "expected-state");
    jar.set("smart_verifier", verifierCanary);
    jar.set("smart_token_endpoint", "https://identity.example/token");
    vi.stubEnv("SMART_CLIENT_ID", "synthetic-public-client");
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function expectNoCredentialsLogged() {
    const output = inspect(errorLog.mock.calls, { depth: null });
    for (const value of [credentialCanary, codeCanary, verifierCanary]) {
      expect(output).not.toContain(value);
    }
  }

  it("withholds upstream OAuth error bodies while returning a generic failure", async () => {
    const upstream = new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: `${credentialCanary} ${codeCanary} ${verifierCanary}`,
    }), { status: 400 });
    const cancelBody = vi.spyOn(upstream.body!, "cancel");
    fetchMock.mockResolvedValue(upstream);

    const response = await GET(callback());

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Token exchange failed.");
    expect(errorLog).toHaveBeenCalled();
    expect(cancelBody).toHaveBeenCalledOnce();
    expectNoCredentialsLogged();
    expect(cookieSets).toHaveLength(0);
    expect(deleted).toEqual(["smart_state", "smart_verifier", "smart_token_endpoint"]);
  });

  it("withholds credentials in transport exceptions", async () => {
    fetchMock.mockRejectedValue(new Error(`${credentialCanary} ${codeCanary} ${verifierCanary}`));

    const response = await GET(callback());

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Token exchange failed.");
    expectNoCredentialsLogged();
    expect(cookieSets).toHaveLength(0);
  });

  it("withholds an untrusted authorization error from logs", async () => {
    const response = await GET(callback(`error=${credentialCanary}`));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Launch was not authorized.");
    expect(fetchMock).not.toHaveBeenCalled();
    expectNoCredentialsLogged();
  });

  it("keeps the PKCE exchange, private token cookie, and patient redirect working", async () => {
    jar.set("demo_session_id", "synthetic-demo-session");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      access_token: credentialCanary,
      expires_in: 3600,
      patient: "synthetic-patient",
    }), { status: 200 }));

    const response = await GET(callback());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://last.example/demo?patient=synthetic-patient");
    expect(fetchMock).toHaveBeenCalledWith("https://identity.example/token", expect.objectContaining({
      method: "POST",
      body: expect.any(URLSearchParams),
    }));
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("code")).toBe(codeCanary);
    expect(body.get("code_verifier")).toBe(verifierCanary);
    expect(body.get("redirect_uri")).toBe("https://last.example/launch/callback");
    expect(cookieSets).toContainEqual({
      name: "medplum_access_token",
      value: credentialCanary,
      options: expect.objectContaining({ httpOnly: true, secure: true, maxAge: 3540 }),
    });
    expect(jar.has("demo_session_id")).toBe(false);
    expectNoCredentialsLogged();
  });
});
