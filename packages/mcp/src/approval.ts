import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

// The reviewable-confirmation protocol for proposal-shaped writes, kept
// behind ONE swappable transport function on purpose: today it rides MCP
// elicitation (spec 2025-06-18, kept in 2025-11-25 — accept/decline/cancel
// with client-rendered UI), and the 2026-07-28 release candidate replaces
// server-initiated elicitation with Multi Round-Trip Requests. The
// accept/decline semantics survive that change; only this file should.
//
// The exchange requests a DECISION, never data: the flat schema is a single
// boolean, which stays inside the spec's rule that elicitation must not
// collect sensitive information. The proposal summary the human reads is
// the same exact-fields rendering the web demo's approval card shows.

export type ApprovalDecision =
  | "approved"
  /** A human saw the proposal and did not approve it. */
  | "denied"
  /** The approval could not be presented at all (capability/transport). */
  | "unavailable";

export type ApprovalRequest = {
  /** Short action title, e.g. "Add this note to the chart?" */
  title: string;
  /** Exact proposed fields, human-readable — what you see is what saves. */
  summary: string;
};

export type RequestApproval = (
  request: ApprovalRequest,
) => Promise<ApprovalDecision>;

/**
 * True when the connected client can render a FORM elicitation — the mode
 * the approval uses. The SDK normalizes a bare `elicitation: {}` capability
 * to `{ form: {} }` at initialization, so checking `form` matches exactly
 * what elicitInput will accept; a URL-mode-only host is NOT approval-capable
 * and must never be offered a write tool.
 */
export function clientSupportsApproval(server: Server): boolean {
  const elicitation = server.getClientCapabilities()?.elicitation as
    | { form?: unknown }
    | undefined;
  return Boolean(elicitation?.form);
}

/**
 * Present the proposal and wait for the human. Only an explicit
 * accept-with-approve commits; a decline, a cancel, or an accept with the
 * box unchecked is a denial, and a transport failure is reported as
 * "unavailable" (the prompt never reached a human). Every non-approved
 * outcome fails closed: the write never fails into saving.
 */
export function createElicitationApproval(server: Server): RequestApproval {
  return async ({ title, summary }) => {
    let result;
    try {
      result = await server.elicitInput({
        message: `${title}\n\n${summary}\n\nNothing is saved unless you approve.`,
        requestedSchema: {
          type: "object",
          properties: {
            approve: {
              type: "boolean",
              title: "Approve and save?",
              description:
                "Approve to save exactly the fields shown above; anything else saves nothing.",
            },
          },
          required: ["approve"],
        },
      });
    } catch {
      // The prompt never reached a human; report that honestly rather than
      // attributing a denial to a reviewer who saw nothing.
      return "unavailable";
    }
    if (result.action !== "accept") return "denied";
    return result.content?.approve === true ? "approved" : "denied";
  };
}
