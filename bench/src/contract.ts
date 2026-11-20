/**
 * What a server config claims about its tool surface.
 *
 * The default matches `@lastehr/mcp` in proposal mode. A different contract
 * turns checks that look at Last EHR argument names into "n/a" instead of
 * a fail. Store checks still run.
 */

export type ServerContract = {
  /** The scripted plan calls this server's tool names. */
  scripted: boolean;
  /** Write tools are omitted unless the client declares MCP elicitation. */
  hidesWritesWithoutElicitation: boolean;
  /**
   * Argument names that carry a cited `ResourceType/id`.
   * Empty means citation checks do not apply.
   */
  citationArgs: readonly string[];
  /** Argument that carries the patient id, when the tool has one. */
  patientArg?: string;
  /** JSON field on a tool result that means the server claims a save. */
  savedClaim?: string;
  /** Whether a write waits on an MCP elicitation prompt. */
  approval: "mcp-elicitation" | "none";
};

export function defaultContract(): ServerContract {
  return {
    scripted: true,
    hidesWritesWithoutElicitation: true,
    citationArgs: ["evidence", "basedOn", "supersedes"],
    patientArg: "patientId",
    savedClaim: "saved",
    approval: "mcp-elicitation",
  };
}

export function isDefaultContract(contract: ServerContract): boolean {
  const baseline = defaultContract();
  return (
    contract.scripted === baseline.scripted &&
    contract.hidesWritesWithoutElicitation === baseline.hidesWritesWithoutElicitation &&
    contract.approval === baseline.approval &&
    contract.patientArg === baseline.patientArg &&
    contract.savedClaim === baseline.savedClaim &&
    contract.citationArgs.join("\n") === baseline.citationArgs.join("\n")
  );
}
