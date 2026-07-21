// The demo backend picker's shared, dependency-free logic. This module is
// imported by BOTH the client (the picker UI) and the server (the chat
// route's gate and the quickstart bootstrap), so it must stay free of
// adapter and SDK imports — the same contract as lib/ai/demo-models.ts.
//
// NEXT_PUBLIC_DEMO_BACKENDS declares the picker options as a comma-separated
// list of "backend-id|Label" pairs, e.g.
//   NEXT_PUBLIC_DEMO_BACKENDS=medplum|Medplum,hapi|HAPI FHIR
// Next.js inlines NEXT_PUBLIC_* into both bundles at build time, so changing
// the list requires a rebuild (the normal Vercel model). The server side
// stays authoritative: a request naming a backend off this list falls back
// to the deployment's FHIR_BACKEND default silently.

/** Every adapter id the runtime factory knows (lib/fhir/backend.ts). */
export const KNOWN_FHIR_BACKENDS = [
  "medplum",
  "hapi",
  "firely",
  "aidbox",
  "oystehr",
] as const;

/**
 * The ids that may be offered in a demo picker at all, enforced in code so an
 * operator env var alone can never widen the demo surface. Flipping an id to
 * eligible is a governance change that must land with updated support-matrix
 * docs and per-target contract-harness evidence (test/fhir-backend-contract.ts,
 * including the _tag/_tag:not isolation semantics), not an env edit.
 *
 * aidbox was flipped 2026-07-18 against an operator-owned hosted dev sandbox
 * (edge, FHIR 4.0.1): contract 5/5 including the isolation clause, seeded,
 * safety eval 7/7. Note its _tag:not bare-system token is silently ignored,
 * so isolation runs on the client-side filter arm — safe, with the
 * window-crowding caveat under heavy concurrent load (docs/support.md).
 * Firely stays excluded: its public sandbox is shared and world-writable.
 * Oystehr is verified synthetic-eval (2026-07-21) but stays demo-excluded
 * until an operator decides to seed and offer their own project.
 */
export const DEMO_ELIGIBLE_BACKENDS = ["medplum", "hapi", "aidbox"] as const;

/** docs/support.md tier per known backend, for picker badges and checks. */
export const DEMO_BACKEND_TIERS: Record<
  (typeof KNOWN_FHIR_BACKENDS)[number],
  "supported" | "local-eval" | "synthetic-eval" | "pending"
> = {
  medplum: "supported",
  hapi: "local-eval",
  firely: "synthetic-eval",
  aidbox: "synthetic-eval",
  oystehr: "synthetic-eval",
};

export type DemoBackend = { id: string; label: string };

export type DemoBackendEntry = DemoBackend & {
  /** The id is an adapter id the factory can construct. */
  known: boolean;
  /** The id passes the code-level demo-eligibility gate above. */
  eligible: boolean;
};

/**
 * Parse every entry of the raw env value, keeping ineligible/unknown ids and
 * flagging them, so scripts/check-backends.ts can report exactly what the
 * runtime will drop instead of warning generically.
 */
export function parseDemoBackendEntries(
  raw: string | undefined,
): DemoBackendEntry[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, ...labelParts] = part.split("|");
      const cleanId = id.trim();
      const label = labelParts.join("|").trim() || cleanId;
      return {
        id: cleanId,
        label,
        known: (KNOWN_FHIR_BACKENDS as readonly string[]).includes(cleanId),
        eligible: (DEMO_ELIGIBLE_BACKENDS as readonly string[]).includes(
          cleanId,
        ),
      };
    })
    .filter((entry) => entry.id.length > 0);
}

/**
 * The runtime allowlist: only demo-eligible ids survive, so a typo or an
 * ineligible backend in the env var can never render a picker option or be
 * honored by the chat route. Duplicate ids collapse to the first entry — a
 * repeated id names the same adapter, and downstream UI keys on the id.
 */
export function parseDemoBackends(raw: string | undefined): DemoBackend[] {
  const seen = new Set<string>();
  return parseDemoBackendEntries(raw)
    .filter((entry) => {
      if (!entry.eligible || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .map(({ id, label }) => ({ id, label }));
}

/**
 * Server-side gate for the x-demo-backend header: honored only for ids on
 * the operator-authored allowlist. Unlisted values return undefined and fall
 * back to the deployment's FHIR_BACKEND default without erroring, so probing
 * yields no signal (the same posture as resolveDemoModel).
 */
export function resolveDemoBackend(
  requested: string | null,
  allowlist: DemoBackend[],
): string | undefined {
  if (!requested) return undefined;
  return allowlist.some((b) => b.id === requested) ? requested : undefined;
}
