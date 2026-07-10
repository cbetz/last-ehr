"use client";

import { useEffect, useState } from "react";

import { DemoChat } from "@/components/demo/demo-chat";
import { IconSpinner } from "@/components/ui/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type State = "loading" | "ready" | "error";

// Establishes the server-side quickstart session (POST /api/auth/quickstart)
// before rendering the chat, so the first send has a valid session cookie.
export function DemoQuickstart() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    // A SMART App Launch (see /launch) already set the session cookie; minting
    // a quickstart token here would clobber that session with the shared demo
    // credential. The launch callback sets a readable marker cookie to signal.
    if (document.cookie.includes("smart_session=1")) {
      setState("ready");
      return;
    }
    let cancelled = false;
    fetch("/api/auth/quickstart", { method: "POST" })
      .then((res) => {
        if (!cancelled) setState(res.ok ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-24 text-muted-foreground">
        <IconSpinner />
        <span className="ml-2" role="status">
          Starting demo…
        </span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="container flex flex-1 items-center justify-center py-16">
        <Alert variant="destructive" className="max-w-md" role="alert">
          <AlertTitle>Quickstart couldn’t start</AlertTitle>
          <AlertDescription>
            In local HAPI mode, confirm the FHIR server is running and the
            HAPI values in <code>.env.local</code> are set. For a
            Medplum-backed quickstart, set <code>MEDPLUM_CLIENT_ID</code> and{" "}
            <code>MEDPLUM_CLIENT_SECRET</code>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <DemoChat />;
}
