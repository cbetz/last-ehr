/**
 * Deny-only write policy: a host-side tightening layer over the approval
 * gate. A policy can block a proposed write; it can never approve one —
 * the human decision stays required for every write that proceeds. The
 * deny-only shape is deliberate: a positive result carries no
 * authorization connotation, so no future caller can wire "policy allows"
 * into "skip the approval card".
 *
 * See docs/agent-write-protocol.md (Decision) for the protocol-level
 * rules this implements.
 */

export type WriteProposalContext = {
  toolName: string;
  resourceType: string;
  patientId: string;
};

export type WritePolicyDecision =
  | {
      deny: true;
      /**
       * Static, operator-authored text. Never interpolate patient or
       * chart data: the reason reaches model context and the browser, and
       * a data-bearing reason would turn policy denials into a probing
       * oracle for facts the agent cannot otherwise read.
       */
      reason?: string;
    }
  | { deny: false };

export type WritePolicy = (
  proposal: WriteProposalContext,
) => WritePolicyDecision | Promise<WritePolicyDecision>;

/** Prefix kept stable: the demo UI shows messages starting with it verbatim. */
export const WRITE_POLICY_DENIED_PREFIX =
  "This write is blocked by deployment policy.";

/**
 * Thrown (never returned) on a policy denial so the chat stream surfaces
 * it as a failed write. Returning an error-shaped result instead would
 * render as a false "saved" success in the demo UI, and a denial must
 * never read as a human decision. The message is operator-safe by
 * construction: a fixed prefix plus the policy's static reason.
 */
export class WritePolicyDeniedError extends Error {
  constructor(reason?: string) {
    // The reason is length-capped as a backstop; its content contract
    // (static operator text, no chart data) is documented on
    // WritePolicyDecision and cannot be enforced at runtime.
    super(
      reason
        ? `${WRITE_POLICY_DENIED_PREFIX} ${reason.slice(0, 300)}`
        : WRITE_POLICY_DENIED_PREFIX,
    );
    this.name = "WritePolicyDeniedError";
  }
}

/**
 * Affirmative-permit evaluation: only an explicit `deny: false` allows.
 * A throwing, rejecting, or malformed policy denies — an optional
 * tightening layer must fail closed, never open. No policy configured
 * allows (the approval gate is still the human).
 */
export async function evaluateWritePolicy(
  policy: WritePolicy | undefined,
  proposal: WriteProposalContext,
): Promise<WritePolicyDecision> {
  if (!policy) return { deny: false };
  try {
    const decision = await policy(proposal);
    if (decision && decision.deny === false) return { deny: false };
    return {
      deny: true,
      ...(decision && decision.deny === true &&
      typeof decision.reason === "string"
        ? { reason: decision.reason }
        : {}),
    };
  } catch {
    // Policy evaluation failure denies, with no diagnostics: error text
    // from an operator hook is not a safe thing to hand model context.
    return { deny: true };
  }
}

export const WRITE_TOOL_NAMES = [
  "add_note",
  "record_observation",
  "create_task",
] as const;

export type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

/**
 * Parse the static disable list (LASTEHR_WRITE_TOOLS_DISABLED, comma
 * separated). Unknown names are rejected loudly: a typo in a tightening
 * control would otherwise silently disable nothing — a control that fails
 * open. Disabled tools are unregistered (never offered to the model), not
 * listed-and-denied, matching the protocol's capability-gating rule.
 */
export function resolveDisabledWriteTools(
  override?: readonly string[],
): ReadonlySet<WriteToolName> {
  const names =
    override ??
    (process.env.LASTEHR_WRITE_TOOLS_DISABLED ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  const unknown = names.filter(
    (name) => !(WRITE_TOOL_NAMES as readonly string[]).includes(name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown write tool name(s) in LASTEHR_WRITE_TOOLS_DISABLED: ` +
        `${unknown.join(", ")}. Valid names: ${WRITE_TOOL_NAMES.join(", ")}.`,
    );
  }
  return new Set(names as WriteToolName[]);
}
