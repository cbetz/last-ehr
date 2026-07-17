import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory stand-in for next/headers cookies().
const jar = new Map<string, string>();
const cookieSets: Array<{ name: string; value: string; maxAge?: number }> = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) as string } : undefined,
    set: (
      name: string,
      value: string,
      options?: { maxAge?: number },
    ): void => {
      jar.set(name, value);
      cookieSets.push({ name, value, maxAge: options?.maxAge });
    },
  }),
}));

const { checkIpRateLimit } = vi.hoisted(() => ({
  checkIpRateLimit: vi
    .fn()
    .mockResolvedValue({ success: true, resetAfter: 0 }),
}));
vi.mock("@/lib/utils/rate-limit", () => ({
  checkIpRateLimit,
  getClientIp: () => "203.0.113.7",
}));

// The Medplum path is exercised elsewhere; mock the module so importing this
// route stays focused on quickstart-session behavior and never touches the
// network.
vi.mock("@medplum/core", () => ({
  MedplumClient: class {
    async startClientLogin(): Promise<void> {}
    getAccessToken(): string | undefined {
      return undefined;
    }
  },
}));

import { POST } from "@/app/api/auth/quickstart/route";

function request(): Request {
  return new Request("http://localhost/api/auth/quickstart", {
    method: "POST",
  });
}

describe("quickstart route, hapi mode", () => {
  beforeEach(() => {
    jar.clear();
    cookieSets.length = 0;
    checkIpRateLimit.mockResolvedValue({ success: true, resetAfter: 0 });
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8080/fhir");
    vi.stubEnv("NEXT_PUBLIC_DEMO_BACKENDS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mints a placeholder session without Medplum credentials", async () => {
    const res = await POST(request());
    expect(res.status).toBe(204);
    const names = cookieSets.map((c) => c.name);
    expect(names).toContain("medplum_access_token");
    expect(names).toContain("demo_session_id");
    const token = cookieSets.find((c) => c.name === "medplum_access_token");
    expect(token?.maxAge).toBe(8 * 60 * 60);
  });

  it("preserves an existing demo_session_id on re-arm", async () => {
    jar.set("demo_session_id", "11111111-2222-3333-4444-555555555555");
    await POST(request());
    const session = cookieSets.find((c) => c.name === "demo_session_id");
    expect(session?.value).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("replaces a malformed session id instead of echoing it", async () => {
    jar.set("demo_session_id", "not a valid id!!");
    await POST(request());
    const session = cookieSets.find((c) => c.name === "demo_session_id");
    expect(session?.value).not.toBe("not a valid id!!");
    expect(session?.value).toMatch(/^[A-Za-z0-9-]{1,64}$/);
  });

  it("rate limits", async () => {
    checkIpRateLimit.mockResolvedValue({ success: false, resetAfter: 30000 });
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(cookieSets).toHaveLength(0);
  });
});

describe("quickstart route, medplum mode", () => {
  beforeEach(() => {
    jar.clear();
    cookieSets.length = 0;
    checkIpRateLimit.mockResolvedValue({ success: true, resetAfter: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("still requires Medplum credentials when FHIR_BACKEND is unset", async () => {
    vi.stubEnv("FHIR_BACKEND", "");
    vi.stubEnv("MEDPLUM_CLIENT_ID", "");
    vi.stubEnv("MEDPLUM_CLIENT_SECRET", "");
    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(cookieSets).toHaveLength(0);
  });

  it("requires Medplum credentials when medplum is in the demo allowlist on a non-medplum default", async () => {
    // With medplum offered in the picker, a placeholder token would 401 the
    // moment a visitor picks it, so the mint path (and its loud 404 when
    // credentials are missing) must win over the placeholder branch.
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8080/fhir");
    vi.stubEnv("NEXT_PUBLIC_DEMO_BACKENDS", "medplum|Medplum,hapi|HAPI");
    vi.stubEnv("MEDPLUM_CLIENT_ID", "");
    vi.stubEnv("MEDPLUM_CLIENT_SECRET", "");
    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(cookieSets).toHaveLength(0);
  });
});

describe("quickstart route, non-medplum defaults", () => {
  beforeEach(() => {
    jar.clear();
    cookieSets.length = 0;
    checkIpRateLimit.mockResolvedValue({ success: true, resetAfter: 0 });
    vi.stubEnv("NEXT_PUBLIC_DEMO_BACKENDS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mints a placeholder session for a firely default (previously a 404)", async () => {
    // The firely adapter authenticates from server env and ignores the
    // cookie token; the cookie just means "a session exists", as with hapi.
    vi.stubEnv("FHIR_BACKEND", "firely");
    vi.stubEnv("MEDPLUM_CLIENT_ID", "");
    vi.stubEnv("MEDPLUM_CLIENT_SECRET", "");
    const res = await POST(request());
    expect(res.status).toBe(204);
    const names = cookieSets.map((c) => c.name);
    expect(names).toContain("medplum_access_token");
    expect(names).toContain("demo_session_id");
  });

  it("keeps failing loudly for a typo'd FHIR_BACKEND instead of minting a session that cannot chat", async () => {
    vi.stubEnv("FHIR_BACKEND", "hapi-typo");
    vi.stubEnv("MEDPLUM_CLIENT_ID", "");
    vi.stubEnv("MEDPLUM_CLIENT_SECRET", "");
    const res = await POST(request());
    expect(res.status).toBe(404);
    expect(cookieSets).toHaveLength(0);
  });
});
