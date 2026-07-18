"use client";

import * as React from "react";

import type { FhirDevEvent } from "@/lib/fhir/observed";
import { Button } from "@/components/ui/button";

// The "under the hood" panel: renders the transient dev-output data parts
// the chat stream carries when NEXT_PUBLIC_DEMO_DEV_OUTPUT is enabled
// (app/api/chat/route.ts). Rows are labeled FHIR OPERATIONS deliberately:
// for the REST adapters they mirror the request line, but Medplum rows are
// synthesized from the operation, not captured from the wire.
export function DevPanel({
  backendName,
  events,
  onClose,
}: {
  /** Server-confirmed resolved backend (from the data-backend part). */
  backendName?: string;
  events: FhirDevEvent[];
  onClose: () => void;
}) {
  const durations = events
    .filter((event) => event.ok)
    .map((event) => event.durationMs)
    .sort((a, b) => a - b);
  const median =
    durations.length > 0
      ? durations[Math.floor((durations.length - 1) / 2)]
      : undefined;

  return (
    // A right rail below the sticky header (h-16). On lg screens the chat
    // shifts left to make room (demo-chat pads its containers while the
    // panel is open) so the rail never covers an approval card's buttons;
    // on small screens it is a deliberate overlay with an explicit Close.
    <aside
      aria-label="FHIR operations"
      className="fixed bottom-0 right-0 top-16 z-30 flex w-full max-w-96 flex-col border-l bg-background shadow-lg"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">FHIR operations</div>
          <div className="truncate text-xs text-muted-foreground">
            {backendName
              ? `Backend: ${backendName} (server-confirmed)`
              : "Backend: awaiting first request"}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div role="log" aria-label="FHIR operation rows" className="min-w-0 flex-1 overflow-auto p-2">
        {events.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Send a message and the agent&apos;s chart operations appear here
            live: method, path, outcome, and timing. Synthetic data only.
          </p>
        ) : (
          <ul className="space-y-1">
            {events.map((event, index) => (
              <li
                key={index}
                className="flex items-baseline gap-2 rounded border bg-muted/30 px-2 py-1 font-mono text-[11px] leading-relaxed"
              >
                <span
                  className={`shrink-0 rounded px-1 font-semibold ${
                    event.method === "POST"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                  }`}
                >
                  {event.method}
                </span>
                <span className="min-w-0 break-all">{event.path}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">
                  {event.ok ? "ok" : "err"} · {event.durationMs}ms
                  {typeof event.resultCount === "number"
                    ? ` · ${event.resultCount} match${event.resultCount === 1 ? "" : "es"}`
                    : ""}
                  {event.resourceId ? ` · id ${event.resourceId}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        {events.length} operation{events.length === 1 ? "" : "s"}
        {typeof median === "number" ? ` · median ${median}ms` : ""} · this
        conversation
      </div>
    </aside>
  );
}
