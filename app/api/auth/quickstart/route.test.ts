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

const { checkRateLimit } = vi.hoisted(() => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, resetAfter: 0 }),
}));
vi.mock("@/lib/utils/rate-limit", () => ({
  checkRateLimit,
  getClientIp: () => "203.0.113.7",
}));

// The Medplum path is exercised elsewhere; mock the module so importing the
// route never touches the network (and never references WebSocket, absent on
// the Node 20 CI floor).
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
    checkRateLimit.mockResolvedValue({ success: true, resetAfter: 0 });
    vi.stubEnv("FHIR_BACKEND", "hapi");
    vi.stubEnv("FHIR_BASE_URL", "http://localhost:8080/fhir");
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
    checkRateLimit.mockResolvedValue({ success: false, resetAfter: 30000 });
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(cookieSets).toHaveLength(0);
  });
});

describe("quickstart route, medplum mode", () => {
  beforeEach(() => {
    jar.clear();
    cookieSets.length = 0;
    checkRateLimit.mockResolvedValue({ success: true, resetAfter: 0 });
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
});
