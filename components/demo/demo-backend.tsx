"use client";

import * as React from "react";

import {
  parseDemoBackends,
  type DemoBackend,
} from "@/lib/fhir/demo-backends";

// Client state for the demo backend picker, shared by the chat (sends the
// x-demo-backend header, renders the pickers), the empty screen (the
// pick-first card), and the header (the mode pill). Build-time inlined
// options; the server re-checks every request against the same list, so all
// of this is display state, not a control (see lib/fhir/demo-backends.ts).
const DEMO_BACKENDS = parseDemoBackends(process.env.NEXT_PUBLIC_DEMO_BACKENDS);
const STORAGE_KEY = "lastehr-demo-backend";

type DemoBackendContextValue = {
  /** Picker options; a picker renders only when there are at least two. */
  backends: DemoBackend[];
  /** Empty string = deployment default (no header sent). */
  backendId: string;
  pickBackend: (id: string) => void;
  /**
   * Whether the picker applies to this session at all: quickstart demo
   * sessions only — never SMART launches (clinician's own project), never
   * the scripted walkthrough (pinned to local HAPI), never sign-in sessions
   * (the server ignores the header without a demo session cookie anyway).
   */
  pickerEnabled: boolean;
};

const DemoBackendContext = React.createContext<DemoBackendContextValue>({
  backends: [],
  backendId: "",
  pickBackend: () => {},
  pickerEnabled: false,
});

export function useDemoBackend(): DemoBackendContextValue {
  return React.useContext(DemoBackendContext);
}

export function DemoBackendProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Persisted per browser; read back in an effect to avoid a hydration
  // mismatch (the model picker's exact pattern in demo-chat.tsx).
  const [backendId, setBackendId] = React.useState("");
  const [smartSession, setSmartSession] = React.useState(false);
  React.useEffect(() => {
    setSmartSession(document.cookie.includes("smart_session=1"));
    const saved = window.localStorage.getItem(STORAGE_KEY) ?? "";
    if (saved && DEMO_BACKENDS.some((b) => b.id === saved)) {
      setBackendId(saved);
    }
  }, []);

  const pickBackend = React.useCallback((id: string) => {
    setBackendId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage unavailable; the choice still applies for this session.
    }
  }, []);

  const pickerEnabled =
    DEMO_BACKENDS.length >= 2 &&
    process.env.NEXT_PUBLIC_QUICKSTART === "true" &&
    process.env.NEXT_PUBLIC_SCRIPTED_DEMO !== "true" &&
    !smartSession;

  return (
    <DemoBackendContext.Provider
      value={{ backends: DEMO_BACKENDS, backendId, pickBackend, pickerEnabled }}
    >
      {children}
    </DemoBackendContext.Provider>
  );
}
