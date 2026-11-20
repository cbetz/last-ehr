/**
 * Turn a reviewer decision into an MCP elicitation result.
 *
 * Last EHR's single-item prompt has an `approve` boolean. Its batch prompt
 * has `decision_*` fields plus `declineAll`. Other servers get a boolean
 * field set when they ask for one. The recorded decision is what the
 * checks count.
 */

import type { ReviewDecision } from "./types.js";

export type ElicitationProperty = { type?: string };

export type ElicitationResponse =
  | { action: "accept"; content: Record<string, string | boolean> }
  | { action: "decline" }
  | { action: "cancel" };

export function elicitationReply(
  properties: Record<string, ElicitationProperty | undefined>,
  decision: ReviewDecision,
): { response: ElicitationResponse; recorded: ReviewDecision; approvedCount?: number } {
  const decisionKeys = Object.keys(properties).filter((key) => key.startsWith("decision_"));
  const batch = decisionKeys.length > 0 && properties.declineAll?.type === "boolean";
  if (batch) {
    if (decision === "cancel") {
      return { response: { action: "cancel" }, recorded: "cancel", approvedCount: 0 };
    }
    if (decision === "decline") {
      return { response: { action: "decline" }, recorded: "decline", approvedCount: 0 };
    }
    const content: Record<string, string> = {};
    const keys = decision === "mixed" ? decisionKeys.slice(0, 1) : decisionKeys;
    for (const key of keys) content[key] = "approve";
    if (decision === "mixed" && decisionKeys[1]) content[decisionKeys[1]] = "decline";
    return {
      response: { action: "accept", content },
      recorded: "approve",
      approvedCount: keys.length,
    };
  }
  const recorded: ReviewDecision = decision === "mixed" ? "approve" : decision;
  if (recorded === "approve") {
    if (!properties.approve) {
      const content: Record<string, boolean> = {};
      for (const [key, schema] of Object.entries(properties)) {
        if (schema?.type === "boolean") content[key] = true;
      }
      if (Object.keys(content).length > 0) {
        return { response: { action: "accept", content }, recorded };
      }
    }
    return { response: { action: "accept", content: { approve: true } }, recorded };
  }
  if (recorded === "cancel") return { response: { action: "cancel" }, recorded };
  return { response: { action: "decline" }, recorded };
}
