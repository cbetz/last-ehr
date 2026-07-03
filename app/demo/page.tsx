"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMedplumContext, useMedplumProfile } from "@medplum/react-hooks";

import { DemoHeader } from "@/components/demo/demo-header";
import { DemoGate } from "@/components/demo/demo-gate";
import { DemoChat } from "@/components/demo/demo-chat";
import { DemoQuickstart } from "@/components/demo/demo-quickstart";
import { DismissibleNotice } from "@/components/demo/dismissible-notice";
import { IconSpinner } from "@/components/ui/icons";

// Quickstart mode skips the Google-OAuth sign-in gate and starts the demo from
// a server-side Medplum client credential. For local / self-host evaluation.
const quickstart = process.env.NEXT_PUBLIC_QUICKSTART === "true";

export default function DemoPage() {
  const { loading } = useMedplumContext();
  const profile = useMedplumProfile();
  // A SMART App Launch session is server-side (HttpOnly cookie), invisible to
  // the browser MedplumClient, so profile stays null. The launch callback sets
  // a readable marker cookie; when present, skip the sign-in gate.
  const [smartSession, setSmartSession] = useState(false);
  useEffect(() => {
    setSmartSession(document.cookie.includes("smart_session=1"));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <DemoHeader />
      {/* Prerendered intro so the page has real, crawlable text (the chat
          itself is client state). Also gives visitors the two deep links. */}
      <DismissibleNotice
        storageKey="lastehr-demo-intro-dismissed"
        className="container max-w-2xl px-4 pt-3 text-center"
      >
        <p className="px-8 text-xs text-muted-foreground">
          A live demo of Last EHR&apos;s four FHIR tools on synthetic
          patients. Writes stop at an approval card. Read{" "}
          <Link
            href="/approval-gated-writes"
            className="underline underline-offset-4 hover:text-foreground"
          >
            how the approval gate works
          </Link>{" "}
          or{" "}
          <Link
            href="/chat-with-fhir-data"
            className="underline underline-offset-4 hover:text-foreground"
          >
            how the agent reads FHIR data
          </Link>
          .
        </p>
      </DismissibleNotice>
      {smartSession ? (
        <main className="flex-1">
          <DemoChat />
        </main>
      ) : quickstart ? (
        <main className="flex flex-1 flex-col">
          <DemoQuickstart />
        </main>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center py-24 text-muted-foreground">
          <IconSpinner />
          <span className="ml-2">Loading…</span>
        </div>
      ) : profile ? (
        <main className="flex-1">
          <DemoChat />
        </main>
      ) : (
        <main className="flex flex-1 flex-col">
          <DemoGate />
        </main>
      )}
    </div>
  );
}
