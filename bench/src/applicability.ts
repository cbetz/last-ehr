/**
 * Decide whether a scenario can run against a server.
 *
 * A scenario that cannot run is "n/a". It is not a fail. A server with no
 * write tools is not a worse score: the benchmark only measures a write.
 */

import type { ServerContract } from "./contract.js";
import type { AgentKind, Scenario } from "./types.js";

export type Applicability = { ok: true } | { ok: false; reason: string };

function needsWrite(scenario: Scenario): boolean {
  const expect = scenario.expect;
  if ((expect.writeCalls ?? 0) > 0) return true;
  if ((expect.savedTrue ?? 0) > 0) return true;
  if (expect.citations || expect.writesTarget || expect.citedChanged) return true;
  if (expect.communication || expect.observation || expect.task) return true;
  if (expect.shape && expect.shape.length > 0) return true;
  return false;
}

export function applicability(input: {
  scenario: Scenario;
  agent: AgentKind;
  contract: ServerContract;
  writeTools: readonly string[];
}): Applicability {
  const { scenario, contract, writeTools } = input;
  if (input.agent === "scripted" && !contract.scripted) {
    return {
      ok: false,
      reason:
        "The scripted plan calls Last EHR tool names. Score this server with --agent model, or with --probe when no model key is set.",
    };
  }
  if (scenario.expect.writeToolsHidden && !contract.hidesWritesWithoutElicitation) {
    return {
      ok: false,
      reason:
        "This scenario checks that write tools are omitted unless the client declares MCP elicitation. This server does not do that.",
    };
  }
  if (
    (scenario.reviewer === "batch-mixed" || scenario.reviewer === "batch-stale-first") &&
    !writeTools.includes("review_pending_proposals")
  ) {
    return {
      ok: false,
      reason:
        "This scenario uses Last EHR batch review (review_pending_proposals). This server does not list that tool.",
    };
  }
  if (
    (scenario.reviewer === "approve-after-cited-change" || scenario.reviewer === "batch-stale-first") &&
    contract.approval !== "mcp-elicitation"
  ) {
    return {
      ok: false,
      reason:
        "Stale-evidence edits a cited resource while an approval prompt is open. This server does not send MCP elicitation, so that pause does not happen.",
    };
  }
  if (scenario.reviewer === "approve-after-cited-change" && contract.citationArgs.length === 0) {
    return {
      ok: false,
      reason:
        "Stale-evidence needs a citation argument on the write so the harness can change that resource. This server does not declare one.",
    };
  }
  if (needsWrite(scenario) && writeTools.length === 0) {
    return {
      ok: false,
      reason:
        "This server lists no write tools. The benchmark only measures what happens when an agent writes.",
    };
  }
  return { ok: true };
}
