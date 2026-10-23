"use client";

import { useEffect, useRef, useState } from "react";

import { DemoChat } from "@/components/demo/demo-chat";
import { IconSpinner } from "@/components/ui/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

type StartupFailure = "rate_limited" | "unavailable" | "network" | "timeout";
type State = { status: "loading" | "ready" } | { status: "error"; category: StartupFailure };
const STARTUP_TIMEOUT_MS = 15_000;

function hasSmartSession(): boolean {
  return document.cookie.split(";").some(cookie => cookie.trim() === "smart_session=1");
}

/** One mounted quickstart: retries share an in-flight request, never its diagnostics. */
export function createQuickstartSession(update: (state: State) => void) {
  let pending: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let ready = false;
  let started = false;
  const reportedFailures = new Set<StartupFailure>();
  const observe = (event: string, properties?: { category: string }) => {
    if (hasSmartSession() || process.env.NEXT_PUBLIC_SCRIPTED_DEMO === "true") return;
    // Analytics must never determine whether the session can start.
    try { track(event, properties); } catch { /* optional analytics */ }
  };

  return {
    start(): Promise<void> {
      if (disposed || ready) return Promise.resolve();
      if (pending) return pending;
      // A SMART launch already set the session cookie. Never replace it with
      // the shared demo credential or include it in the evaluation funnel.
      if (hasSmartSession()) {
        ready = true;
        update({ status: "ready" });
        return Promise.resolve();
      }
      update({ status: "loading" });
      if (!started) {
        started = true;
        observe("demo_quickstart_started");
      }
      const request = new AbortController();
      controller = request;
      let timedOut = false;
      timer = setTimeout(() => { timedOut = true; request.abort(); }, STARTUP_TIMEOUT_MS);
      const fail = (category: StartupFailure) => {
        if (disposed) return;
        update({ status: "error", category });
        // Four possible categories, emitted at most once each per mount.
        if (!reportedFailures.has(category)) {
          reportedFailures.add(category);
          observe("demo_error_shown", { category: `quickstart_${category}` });
        }
      };
      pending = Promise.resolve().then(async () => {
        try {
          if (disposed) return;
          const response = await fetch("/api/auth/quickstart", {
            method: "POST", credentials: "same-origin", redirect: "error", signal: request.signal,
          });
          // Only status is relevant. Never read or display a backend body.
          void response.body?.cancel().catch(() => {});
          if (disposed) return;
          if (!response.ok) {
            fail(response.status === 429 ? "rate_limited" : "unavailable");
            return;
          }
          ready = true;
          update({ status: "ready" });
          observe("demo_quickstart_ready");
        } catch {
          fail(timedOut ? "timeout" : "network");
        } finally {
          clearTimeout(timer);
          controller = undefined;
          pending = undefined;
        }
      });
      return pending;
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}

export function QuickstartStartupError({ category, onRetry }: { category: StartupFailure; onRetry: () => void }) {
  const message = {
    rate_limited: "The demo is receiving too many requests. Wait a moment, then try again.",
    unavailable: "The demo is temporarily unavailable. Please try again in a moment.",
    network: "We couldn’t connect to the demo. Check your connection and try again.",
    timeout: "The demo took too long to respond. Please try again.",
  }[category];
  return (
    <div className="container flex flex-1 items-center justify-center py-16">
      <Alert variant="destructive" className="max-w-md" role="alert">
        <AlertTitle className="text-foreground">The demo couldn’t start</AlertTitle>
        <AlertDescription className="text-muted-foreground">{message}</AlertDescription>
        <Button type="button" variant="outline" size="sm" className="mt-4 text-foreground" onClick={onRetry}>
          Retry
        </Button>
      </Alert>
    </div>
  );
}

// Establishes the server-side quickstart session (POST /api/auth/quickstart)
// before rendering the chat, so the first send has a valid session cookie.
export function DemoQuickstart() {
  const [state, setState] = useState<State>({ status: "loading" });
  const session = useRef<ReturnType<typeof createQuickstartSession> | null>(null);

  useEffect(() => {
    const current = createQuickstartSession(setState);
    session.current = current;
    void current.start();
    return () => {
      current.dispose();
      if (session.current === current) session.current = null;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-muted-foreground">
        <IconSpinner />
        <span className="ml-2" role="status">
          Starting demo…
        </span>
      </div>
    );
  }

  if (state.status === "error") {
    return <QuickstartStartupError category={state.category} onRetry={() => { void session.current?.start(); }} />;
  }

  return <DemoChat />;
}
