import { READ_TOOLS, PROPOSAL_TOOLS, TOOL_CATALOG } from "./tool-catalog";

/**
 * The counted claims the site makes about chart reach.
 *
 * Two kinds of number live here. The tool counts derive from
 * ./tool-catalog.ts, which lib/tool-catalog.test.ts already pins to the real
 * registrations. The section count and the US Core figures are stated, because
 * no code can derive them, so lib/coverage.test.ts pins the section count to
 * the reader's own section list and states where the rest come from.
 *
 * docs/fhir-coverage.md stays the source of truth for the US Core numbers, and
 * it shows the method: US Core 9.0.0, 56 profiles over 27 distinct resource
 * types, counted from the published profile list, generated 2026-05-31.
 */

/** The US Core version the count runs against. */
export const US_CORE_VERSION = "9.0.0";

/** Distinct readable resource types in that version of US Core. */
export const US_CORE_READABLE_TYPES = 27;

/** How many of those types the agent can read today. */
export const US_CORE_TYPES_COVERED = 25;

/** The 2 remaining types, both blocked on data shape rather than mechanism. */
export const US_CORE_TYPES_REMAINING = ["Medication", "PractitionerRole"];

/**
 * Patient-scoped chart sections read_chart_section accepts. Pinned to the
 * reader's own enum by lib/coverage.test.ts, so a new section updates the
 * published number or fails CI.
 */
export const CHART_SECTION_COUNT = 23;

export const TOOL_COUNT = TOOL_CATALOG.length;
export const READ_TOOL_COUNT = READ_TOOLS.length;
export const PROPOSAL_TOOL_COUNT = PROPOSAL_TOOLS.length;

/**
 * Each rule is a test, not best-effort behavior. Every one came from a real
 * false negative found against a live FHIR server.
 */
export const HONESTY_GUARDS = [
  "If a read hits a result limit, the agent says so. A partial list never reads as a complete chart.",
  "If a code filter matches nothing in a section that does hold records, the agent reports no match, not an absence.",
  "If a section cannot apply a filter, the agent refuses it and lists the values it accepts.",
  "If a reference lookup fails, the agent reports the failure. A missing author or encounter never reads as absent.",
  "If a document is a scan or a PDF, the agent reports it as unread. It never reports the document as empty.",
];
