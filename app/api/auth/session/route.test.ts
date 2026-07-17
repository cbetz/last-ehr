import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for next/headers cookies().
const jar = new Map<string, string>();
const cookieSets: Array<{ name: string; value: string; maxAge?: number }> = [];
const cookieDeletes: string[] = [];

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
    delete: (name: string): void => {
      jar.delete(name);
      cookieDeletes.push(name);
    },
  }),
}));

import { POST, DELETE } from "@/app/api/auth/session/route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("session route", () => {
  beforeEach(() => {
    jar.clear();
    cookieSets.length = 0;
    cookieDeletes.length = 0;
  });

  it("sets the HttpOnly session cookie from a posted token", async () => {
    const res = await POST(request({ accessToken: "tok" }));
    expect(res.status).toBe(204);
    const token = cookieSets.find((c) => c.name === "medplum_access_token");
    expect(token?.value).toBe("tok");
    expect(token?.maxAge).toBe(60 * 60);
  });

  it("clears a leftover demo_session_id on sign-in, so a signed-in session is never a demo session", async () => {
    jar.set("demo_session_id", "11111111-2222-3333-4444-555555555555");
    const res = await POST(request({ accessToken: "tok" }));
    expect(res.status).toBe(204);
    expect(cookieDeletes).toContain("demo_session_id");
    expect(jar.has("demo_session_id")).toBe(false);
  });

  it("rejects bodies without a token", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect(cookieSets).toHaveLength(0);
  });

  it("clears the session cookie on sign-out", async () => {
    jar.set("medplum_access_token", "tok");
    const res = await DELETE();
    expect(res.status).toBe(204);
    expect(cookieDeletes).toContain("medplum_access_token");
  });
});
