import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
vi.mock("posthog-js", () => ({ default: { capture } }));
vi.mock("@/components/demo/demo-chat", () => ({ DemoChat: () => null }));

import { createQuickstartSession, QuickstartStartupError } from "./demo-quickstart";

beforeEach(() => {
  capture.mockReset();
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { cookie: "" });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-optional-key");
  vi.stubEnv("NEXT_PUBLIC_SCRIPTED_DEMO", "false");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// Exercise async session behavior directly and render the error to static
// markup: neither requires a browser DOM or another testing dependency.
describe("quickstart startup", () => {
  it("preserves an existing SMART session without fetching or tracking", async () => {
    document.cookie = "other=value; smart_session=1";
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const update = vi.fn();
    const session = createQuickstartSession(update);
    await session.start();
    expect(update.mock.calls).toEqual([[{ status: "ready" }]]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    session.dispose();
  });

  it("starts a same-origin cookie session once and then leaves the chat ready", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchFn);
    const update = vi.fn();
    const session = createQuickstartSession(update);
    await session.start();
    await session.start();
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith("/api/auth/quickstart", {
      method: "POST", credentials: "same-origin", redirect: "error", signal: expect.any(AbortSignal),
    });
    expect(update.mock.calls).toEqual([[{ status: "loading" }], [{ status: "ready" }]]);
    expect(capture.mock.calls).toEqual([
      ["demo_quickstart_started", undefined], ["demo_quickstart_ready", undefined],
    ]);
    session.dispose();
  });

  it.each([[429, "rate_limited"], [502, "unavailable"], [404, "unavailable"]] as const)(
    "reports HTTP %s through a fixed category without reading or logging diagnostics",
    async (status, category) => {
      const cancel = vi.fn(async () => {});
      const text = vi.fn(() => { throw new Error("PRIVATE_BACKEND_SECRET"); });
      const json = vi.fn(() => { throw new Error("PRIVATE_BACKEND_SECRET"); });
      const response = { ok: false, status, body: { cancel }, text, json, url: "https://private.example/?token=PRIVATE_TOKEN" };
      vi.stubGlobal("fetch", vi.fn(async () => response));
      const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
      const update = vi.fn();
      const session = createQuickstartSession(update);
      await session.start();
      expect(update).toHaveBeenLastCalledWith({ status: "error", category });
      expect(capture).toHaveBeenLastCalledWith("demo_error_shown", { category: `quickstart_${category}` });
      expect(cancel).toHaveBeenCalledOnce();
      expect(text).not.toHaveBeenCalled();
      expect(json).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
      expect(JSON.stringify([...update.mock.calls, ...capture.mock.calls])).not.toMatch(/PRIVATE|private\.example/);
      session.dispose();
    },
  );

  it("allows retry after a network failure and shares each in-flight attempt", async () => {
    let resolveRetry: ((response: Response) => void) | undefined;
    const fetchFn = vi.fn()
      // A synchronous transport failure must also release the retry guard.
      .mockImplementationOnce(() => { throw new Error("PRIVATE_NETWORK_TOKEN https://private.example"); })
      .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveRetry = resolve; }));
    vi.stubGlobal("fetch", fetchFn);
    const update = vi.fn();
    const session = createQuickstartSession(update);
    const initial = session.start();
    expect(session.start()).toBe(initial);
    await initial;
    expect(update).toHaveBeenLastCalledWith({ status: "error", category: "network" });
    const retry = session.start();
    expect(session.start()).toBe(retry);
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith({ status: "loading" });
    resolveRetry!(new Response(null, { status: 204 }));
    await retry;
    expect(update).toHaveBeenLastCalledWith({ status: "ready" });
    expect(capture.mock.calls).toEqual([
      ["demo_quickstart_started", undefined],
      ["demo_error_shown", { category: "quickstart_network" }],
      ["demo_quickstart_ready", undefined],
    ]);
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(/PRIVATE|private\.example/);
    session.dispose();
  });

  it("dedupes repeated failure categories while allowing another retry", async () => {
    const fetchFn = vi.fn(async () => new Response("PRIVATE_BODY", { status: 502 }));
    vi.stubGlobal("fetch", fetchFn);
    const session = createQuickstartSession(vi.fn());
    await session.start();
    await session.start();
    await session.start();
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(capture.mock.calls).toEqual([
      ["demo_quickstart_started", undefined],
      ["demo_error_shown", { category: "quickstart_unavailable" }],
    ]);
    session.dispose();
  });

  it("times out a stalled request and permits a fresh retry", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn<typeof fetch>()
      .mockImplementationOnce(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("PRIVATE_ABORT_REASON")), { once: true });
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchFn);
    const update = vi.fn();
    const session = createQuickstartSession(update);
    const initial = session.start();
    await vi.advanceTimersByTimeAsync(15_000);
    await initial;
    expect(update).toHaveBeenLastCalledWith({ status: "error", category: "timeout" });
    expect(fetchFn.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(capture).toHaveBeenLastCalledWith("demo_error_shown", { category: "quickstart_timeout" });
    await session.start();
    expect(update).toHaveBeenLastCalledWith({ status: "ready" });
    session.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels on unmount without reporting an error or updating a stale view", async () => {
    let signal: AbortSignal | undefined;
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      signal = init!.signal!;
      return new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener("abort", () => reject(new Error("PRIVATE_ABORT_REASON")), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchFn);
    const update = vi.fn();
    const session = createQuickstartSession(update);
    const initial = session.start();
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledOnce());
    session.dispose();
    await initial;
    await session.start();
    expect(signal?.aborted).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(update.mock.calls).toEqual([[{ status: "loading" }]]);
    expect(capture.mock.calls).toEqual([["demo_quickstart_started", undefined]]);
  });

  it.each(["no-key", "scripted", "no-window"])("keeps analytics off for %s", async scenario => {
    if (scenario === "no-key") vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    if (scenario === "scripted") vi.stubEnv("NEXT_PUBLIC_SCRIPTED_DEMO", "true");
    if (scenario === "no-window") vi.stubGlobal("window", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    const update = vi.fn();
    const session = createQuickstartSession(update);
    await session.start();
    expect(update).toHaveBeenLastCalledWith({ status: "error", category: "rate_limited" });
    expect(capture).not.toHaveBeenCalled();
    session.dispose();
  });

  it("does not let optional analytics failure break successful startup", async () => {
    capture.mockImplementation(() => { throw new Error("PRIVATE_ANALYTICS_FAILURE"); });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const update = vi.fn();
    const session = createQuickstartSession(update);
    await session.start();
    expect(update).toHaveBeenLastCalledWith({ status: "ready" });
    session.dispose();
  });
});

describe("visitor startup error", () => {
  it.each(["rate_limited", "unavailable", "network", "timeout"] as const)(
    "offers Retry with visitor-appropriate %s copy",
    category => {
      const html = renderToStaticMarkup(<QuickstartStartupError category={category} onRetry={() => {}} />);
      expect(html).toContain('role="alert"');
      expect(html).toMatch(/<button[^>]*type="button"[^>]*>Retry<\/button>/);
      expect(html).not.toMatch(/MEDPLUM|CLIENT_SECRET|CLIENT_ID|\.env|HAPI|PRIVATE/);
      expect(html).toContain(category === "rate_limited" ? "too many requests" : category === "network"
        ? "Check your connection" : category === "timeout" ? "too long" : "temporarily unavailable");
    },
  );
});
