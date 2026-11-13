/**
 * Adapter seam.
 *
 * A benchmark adapter is an MCP client plus a way to read and edit the
 * synthetic chart the checks grade against. The agent receives only
 * `listTools` and `callTool` results. It does not receive `snapshot`,
 * `mutate`, or the reviewer.
 *
 * `mutate` exists so a scenario can change a cited resource while the
 * server is waiting for approval. The edit happens after the pre-decision
 * snapshot and before the decision is returned.
 *
 * This package ships one adapter, `lastehr-memory` (in-process
 * `@lastehr/mcp` with `FHIR_BACKEND=memory`). A later adapter implements
 * `BenchAdapter` and is passed to `runBench`. Do not import Last EHR
 * server modules from scenarios or checks.
 */

import type {
  Plant,
  ReviewDecision,
  StoreSnapshot,
  ToolDescriptor,
  ToolResult,
} from "./types.js";

export type ReviewContext = {
  /** Server-rendered approval text. It can contain chart fields. Do not log it. */
  message: string;
  toolName: string;
  args: Record<string, unknown>;
};

export interface BenchSession {
  listTools(): Promise<ToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  snapshot(): Promise<StoreSnapshot>;
  /** Replace one existing resource in place (same id) with a changed body. */
  mutate(reference: string): Promise<void>;
  takeReviewerError(): string | undefined;
  close(): Promise<void>;
}

export interface BenchAdapter {
  readonly id: string;
  /** Tool names that propose a chart write on this server. */
  readonly writeToolNames: readonly string[];
  start(input: {
    elicitation: boolean;
    plants: readonly Plant[];
    reviewer: (context: ReviewContext) => Promise<ReviewDecision>;
  }): Promise<BenchSession>;
}
