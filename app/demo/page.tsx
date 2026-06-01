"use client";

import { useMedplumContext, useMedplumProfile } from "@medplum/react-hooks";

import { DemoHeader } from "@/components/demo/demo-header";
import { DemoGate } from "@/components/demo/demo-gate";
import { DemoChat } from "@/components/demo/demo-chat";
import { IconSpinner } from "@/components/ui/icons";

export default function DemoPage() {
  const { loading } = useMedplumContext();
  const profile = useMedplumProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <DemoHeader />
      {loading ? (
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
