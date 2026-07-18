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

// Fake model layer: streamText must never run a model here. Both stream
// tails record the options they were handed (the onError placement is a
// safety boundary), and toUIMessageStream emits a bare 'start' chunk so the
// real createUIMessageStream's messageId behavior is exercised.
const {
  streamText,
  toUIMessageStreamOptions,
  toUIMessageStreamResponseOptions,
  isScriptedDemoEnabled,
} = vi.hoisted(() => {
  type ErrorOpts = { onError?: (error: unknown) => string };
  const toUIMessageStreamOptions: ErrorOpts[] = [];
  const toUIMessageStreamResponseOptions: ErrorOpts[] = [];
  return {
    toUIMessageStreamOptions,
    toUIMessageStreamResponseOptions,
    streamText: vi.fn(() => ({
      toUIMessageStream: (opts?: ErrorOpts) => {
        toUIMessageStreamOptions.push(opts ?? {});
        return new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "start" });
            controller.close();
          },
        });
      },
      toUIMessageStreamResponse: (opts?: ErrorOpts) => {
        toUIMessageStreamResponseOptions.push(opts ?? {});
        return new Response("main-identical-tail", { status: 200 });
      },
    })),
    isScriptedDemoEnabled: vi.fn(() => false),
  };
});
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
    toUIMessageStreamOptions.length = 0;
    toUIMessageStreamResponseOptions.length = 0;
    vi.stubEnv("FHIR_BACKEND", "medplum");
    vi.stubEnv("NEXT_PUBLIC_DEMO_BACKENDS", "medplum|Medplum,hapi|HAPI");
    vi.stubEnv("HAPI_BASE_URL", "http://localhost:8080/fhir");
    vi.stubEnv("FHIR_BASE_URL", "");
    vi.stubEnv("LASTEHR_AUDIT_REJECTED_PROPOSALS", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_DEV_OUTPUT", "");
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

  it("keeps the main-identical tail with the flag off, with the scrubber in its onError seat", async () => {
    // The pre-dev-output tail (result.toUIMessageStreamResponse) is
    // load-bearing: createUIMessageStream stamps a messageId onto 'start',
    // which would break the approval auto-resend. Flag off must not touch it.
    const body = await (await POST(request())).text();
    expect(body).toBe("main-identical-tail");
    expect(toUIMessageStreamOptions).toHaveLength(0);
    expect(toUIMessageStreamResponseOptions).toHaveLength(1);
    const onError = toUIMessageStreamResponseOptions[0].onError;
    const scrubbed = onError!(
      new Error("FHIR request failed: Patient/secret-id not permitted"),
    );
    expect(scrubbed).toBe(
      "A chart request failed. Check your backend access and try again.",
    );
    expect(scrubbed).not.toContain("secret-id");
  });

  it("scrubs mid-stream errors in toUIMessageStream's own onError (safety boundary)", async () => {
    // With dev output on, toUIMessageStream stringifies mid-stream
    // streamText failures through its OWN onError (default: raw
    // error.message). The route must hand the scrubber to it directly —
    // createUIMessageStream's onError alone would let FHIR diagnostics
    // reach the browser.
    vi.stubEnv("NEXT_PUBLIC_DEMO_DEV_OUTPUT", "true");
    await POST(request());
    expect(toUIMessageStreamOptions).toHaveLength(1);
    const onError = toUIMessageStreamOptions[0].onError;
    expect(onError).toBeTypeOf("function");
    const scrubbed = onError!(
      new Error("FHIR request failed: Patient/secret-id not permitted"),
    );
    expect(scrubbed).toBe(
      "A chart request failed. Check your backend access and try again.",
    );
    expect(scrubbed).not.toContain("secret-id");
  });

  it("continues the last assistant message's id on resume turns (approval auto-resend)", async () => {
    // Regression pin for the messageId injection: without originalMessages,
    // createUIMessageStream stamps a fresh id on 'start' and the approval
    // auto-resend duplicates the assistant message client-side.
    vi.stubEnv("NEXT_PUBLIC_DEMO_DEV_OUTPUT", "true");
    const resumeShaped = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          { id: "u1", role: "user", parts: [{ type: "text", text: "hi" }] },
          {
            id: "a1",
            role: "assistant",
            parts: [{ type: "text", text: "proposing…" }],
          },
        ],
      }),
    });
    const body = await (await POST(resumeShaped)).text();
    expect(body).toContain('"messageId":"a1"');
  });

  it("streams a transient data-backend part only when dev output is on for a demo session", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_DEV_OUTPUT", "true");
    const body = await (await POST(request({ "x-demo-backend": "hapi" }))).text();
    expect(body).toContain('"type":"data-backend"');
    expect(body).toContain('"name":"hapi"');
    expect(body).toContain('"transient":true');
  });

  it("streams no dev parts when the flag is off or the session is not a demo session", async () => {
    const flagOff = await (await POST(request())).text();
    expect(flagOff).not.toContain("data-backend");

    vi.stubEnv("NEXT_PUBLIC_DEMO_DEV_OUTPUT", "true");
    jar.delete("demo_session_id");
    const noSession = await (await POST(request())).text();
    expect(noSession).not.toContain("data-backend");
  });
});
