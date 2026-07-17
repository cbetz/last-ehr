import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The chat route's demo-backend gate is a security boundary: these tests pin
// the composition (header honored only for demo sessions, never under the
// scripted gate, silent fallback for unconfigured picks, audit pinned to the
// deployment default). The leaf helpers have their own unit tests.

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) as string } : undefined,
  }),
}));

vi.mock("@/lib/utils/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, resetAfter: 0 }),
  getClientIp: () => "203.0.113.7",
}));

// Fake model layer: streamText must never run a model here.
const { streamText, isScriptedDemoEnabled } = vi.hoisted(() => ({
  streamText: vi.fn(() => ({
    toUIMessageStreamResponse: () => new Response(null, { status: 200 }),
  })),
  isScriptedDemoEnabled: vi.fn(() => false),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText,
}));
vi.mock("@/lib/ai/model", () => ({
  getChatModel: () => ({}),
  isScriptedDemoEnabled,
}));

// Record every factory call; each fake backend remembers the name it was
// created with so audit pinning is observable.
const { createFhirBackend, findDeniedProposals, recordRejectedProposal } =
  vi.hoisted(() => ({
    createFhirBackend: vi.fn((accessToken: string, name?: string) => ({
      accessToken,
      name,
    })),
    findDeniedProposals: vi.fn((): unknown[] => []),
    recordRejectedProposal: vi.fn<(...args: unknown[]) => Promise<void>>(
      async () => {},
    ),
  }));
vi.mock("@/lib/fhir/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fhir/backend")>()),
  createFhirBackend,
}));
vi.mock("@/lib/fhir/audit", () => ({
  findDeniedProposals,
  recordRejectedProposal,
}));

import { POST } from "@/app/api/chat/route";

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      messages: [
        { id: "1", role: "user", parts: [{ type: "text", text: "hi" }] },
      ],
    }),
  });
}

describe("chat route demo-backend gate", () => {
  beforeEach(() => {
    jar.clear();
    jar.set("medplum_access_token", "tok");
    jar.set("demo_session_id", "11111111-2222-3333-4444-555555555555");
    createFhirBackend.mockClear();
    findDeniedProposals.mockReturnValue([]);
    recordRejectedProposal.mockClear();
    isScriptedDemoEnabled.mockReturnValue(false);
    vi.stubEnv("FHIR_BACKEND", "medplum");
    vi.stubEnv("NEXT_PUBLIC_DEMO_BACKENDS", "medplum|Medplum,hapi|HAPI");
    vi.stubEnv("HAPI_BASE_URL", "http://localhost:8080/fhir");
    vi.stubEnv("FHIR_BASE_URL", "");
    vi.stubEnv("LASTEHR_AUDIT_REJECTED_PROPOSALS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("honors an allowlisted, configured pick for a demo session", async () => {
    expect((await POST(request({ "x-demo-backend": "hapi" }))).status).toBe(200);
    expect(createFhirBackend).toHaveBeenCalledWith("tok", "hapi");
  });

  it("ignores the header when the session is not a demo session", async () => {
    jar.delete("demo_session_id");
    await POST(request({ "x-demo-backend": "hapi" }));
    expect(createFhirBackend).toHaveBeenCalledWith("tok", undefined);
  });

  it("ignores the header under the scripted gate", async () => {
    isScriptedDemoEnabled.mockReturnValue(true);
    vi.stubEnv("FHIR_BACKEND", "hapi");
    await POST(request({ "x-demo-backend": "medplum" }));
    expect(createFhirBackend).toHaveBeenCalledWith("tok", undefined);
  });

  it("silently falls back when the picked backend's config is incomplete", async () => {
    vi.stubEnv("HAPI_BASE_URL", "");
    await POST(request({ "x-demo-backend": "hapi" }));
    expect(createFhirBackend).toHaveBeenCalledWith("tok", undefined);
  });

  it("silently ignores unlisted and ineligible names", async () => {
    await POST(request({ "x-demo-backend": "firely" }));
    await POST(request({ "x-demo-backend": "not-a-backend" }));
    for (const call of createFhirBackend.mock.calls) {
      expect(call[1]).toBeUndefined();
    }
  });

  it("pins the rejected-proposal audit to the deployment default, never the pick", async () => {
    vi.stubEnv("LASTEHR_AUDIT_REJECTED_PROPOSALS", "true");
    findDeniedProposals.mockReturnValue([{ toolName: "add_note" }]);
    await POST(request({ "x-demo-backend": "hapi" }));
    expect(recordRejectedProposal).toHaveBeenCalledTimes(1);
    const auditBackend = recordRejectedProposal.mock.calls[0]?.[0] as {
      name?: string;
    };
    expect(auditBackend).toEqual({ accessToken: "tok", name: undefined });
  });
});
