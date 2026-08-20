/**
 * The agent's tool surface in one place, because the published description of
 * it kept drifting from the shipped code. The homepage manifest listed five of
 * eight tools, and the README described the MCP read surface as two tools long
 * after it grew to four — always in the direction of understating what the
 * agent can reach.
 *
 * Rendered by components/AI.tsx and pinned to the real registrations by
 * lib/tool-catalog.test.ts, so adding a tool without describing it here fails
 * CI rather than quietly shipping an out-of-date manifest.
 */

/** A read executes freely; a proposal cannot commit without a human decision. */
export type ToolKind = "read" | "proposal";

export type CatalogTool = {
  name: string;
  kind: ToolKind;
  /** One line, honest about what bounds the tool — not just what it does. */
  detail: string;
};

export const TOOL_CATALOG: readonly CatalogTool[] = [
  {
    name: "search_patients",
    kind: "read",
    detail:
      "Find a patient by name. The name is passed as a structured search parameter, never spliced into a query string.",
  },
  {
    name: "show_patient_info",
    kind: "read",
    detail:
      "Open one patient's chart across 23 sections, reporting when a window was capped rather than implying the chart is empty.",
  },
  {
    name: "read_chart_section",
    kind: "read",
    detail:
      "Read one section with code and date filters, and follow references for authors, encounter, facility, or provenance. The tool builds the query; the model never does.",
  },
  {
    name: "read_document",
    kind: "read",
    detail:
      "Read what a note actually says. Decodes an inline text body only — a scan or pointer-only attachment is reported as unread, never as empty.",
  },
  {
    name: "add_note",
    kind: "proposal",
    detail:
      "Propose a free-text clinical note; a human approves the exact text before it saves.",
  },
  {
    name: "record_observation",
    kind: "proposal",
    detail:
      "Propose a measurement. A recognized vital gains LOINC and UCUM coding from a pinned table; an unrecognized label stays honestly uncoded.",
  },
  {
    name: "record_superseding_observation",
    kind: "proposal",
    detail:
      "Correct a wrong value without an update: the new entry is filed linked to the one it supersedes, and the approval card states that the earlier entry stays on the chart.",
  },
  {
    name: "create_task",
    kind: "proposal",
    detail:
      "Propose a follow-up task, optionally with a due date, behind the same approval gate.",
  },
];

export const READ_TOOLS = TOOL_CATALOG.filter((t) => t.kind === "read");
export const PROPOSAL_TOOLS = TOOL_CATALOG.filter((t) => t.kind === "proposal");
