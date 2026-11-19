import type { EvidencePin } from "./cited-version.js";

// Batch review of proposals a write tool held instead of asking immediately.
// Each item needs its own decision. There is no approve-all: a payload that
// asks for one is rejected and nothing is saved. Decline-all only fills
// items the reviewer left unset. Unset items stay pending.

export const BATCH_DECLINE_OUTCOME =
  "The human reviewer did not approve this write; nothing was saved to the chart.";

export const BATCH_ITEM_FAILURE_OUTCOME =
  "This proposal could not be saved. Other proposals were not changed by this failure.";

const APPROVE_ALL = /^approve[-_\s]?all$/i;

export type BatchItemDecision = "approve" | "decline";

export type HeldProposal = {
  id: string;
  patientId: string;
  toolName: string;
  resourceType: string;
  title: string;
  /** Same review text a single approval prompt would show, including the diff. */
  summary: string;
  uncited: boolean;
  pins: readonly EvidencePin[];
  commit: () => Promise<Record<string, unknown>>;
};

export type PendingProposalView = {
  id: string;
  patientId: string;
  patient: string;
  toolName: string;
  resourceType: string;
  title: string;
  summary: string;
  uncited: boolean;
};

export type BatchItemResult = {
  id: string;
  decision: BatchItemDecision;
  saved: boolean;
  outcome?: string;
  resourceType?: string;
  resourceId?: string;
};

export type BatchSubmitResult = {
  submitted: boolean;
  saved: boolean;
  results: BatchItemResult[];
  pending: string[];
  outcome: string;
};

type FormSchema = {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
};

export type BatchFormResult =
  | { action: "accept"; content: Record<string, unknown> }
  | { action: "denied" }
  | { action: "unavailable" };

export type RequestBatchForm = (input: {
  message: string;
  requestedSchema: FormSchema;
}) => Promise<BatchFormResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** True when a key, enum value, or nested field asks to approve every item. */
export function containsApproveAll(value: unknown): boolean {
  if (typeof value === "string") return APPROVE_ALL.test(value.trim());
  if (Array.isArray(value)) return value.some((item) => containsApproveAll(item));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => APPROVE_ALL.test(key) || containsApproveAll(child),
  );
}

export function schemaOffersApproveAll(schema: {
  properties?: Record<string, unknown>;
}): boolean {
  return containsApproveAll(schema.properties ?? {});
}

export function batchDecisionSchema(
  items: readonly { id: string; title: string; patientId: string }[],
): FormSchema {
  const properties: Record<string, Record<string, unknown>> = {};
  for (const item of items) {
    properties[`decision_${item.id}`] = {
      type: "string",
      enum: ["approve", "decline"],
      title: `${item.title} · Patient/${item.patientId}`,
      description:
        "Approve or decline this proposal only. Leave it unset to keep the proposal pending.",
    };
  }
  properties.declineAll = {
    type: "boolean",
    title: "Decline every proposal left unset",
    description: "Declines only. This does not approve any proposal.",
  };
  const schema: FormSchema = {
    type: "object",
    properties,
    required: [],
    additionalProperties: false,
  };
  if (schemaOffersApproveAll(schema)) {
    throw new Error("Batch review schema must not offer approve-all.");
  }
  return schema;
}

export type ResolvedDecisions =
  | { ok: true; decisions: Map<string, BatchItemDecision> }
  | { ok: false; outcome: string };

/**
 * Map a reviewer's form onto per-item decisions. Unknown ids are ignored.
 * An approve-all field rejects the whole submit. declineAll fills only
 * items with no explicit choice.
 */
export function resolveBatchDecisions(
  pendingIds: readonly string[],
  raw: unknown,
): ResolvedDecisions {
  if (containsApproveAll(raw)) {
    return {
      ok: false,
      outcome:
        "Batch review has no approve-all. Decide each proposal. Nothing was saved.",
    };
  }
  const record = isRecord(raw) ? raw : {};
  const declineAll = record.declineAll === true;
  const decisions = new Map<string, BatchItemDecision>();
  for (const id of pendingIds) {
    const value = record[`decision_${id}`];
    if (value === "approve" || value === "decline") {
      decisions.set(id, value);
      continue;
    }
    if (declineAll) decisions.set(id, "decline");
  }
  return { ok: true, decisions };
}

const MAX_BATCH_MESSAGE = 12_000;

export function batchReviewMessage(items: readonly PendingProposalView[]): string {
  const lines = [
    "Review each proposal on its own. Approving one does not approve any other. Leave a proposal unset to keep it pending. Nothing is saved until you submit.",
    "",
  ];
  for (const item of items) {
    lines.push(`--- ${item.id} · ${item.patient} · ${item.toolName} ---`);
    lines.push(item.summary);
    if (item.uncited) {
      lines.push("Uncited proposal: no chart resource was named as evidence.");
    }
    lines.push("");
  }
  let text = lines.join("\n");
  if (text.length > MAX_BATCH_MESSAGE) {
    text = `${text.slice(0, MAX_BATCH_MESSAGE)}\n… review truncated`;
  }
  return text;
}

function toView(item: HeldProposal): PendingProposalView {
  return {
    id: item.id,
    patientId: item.patientId,
    patient: `Patient/${item.patientId}`,
    toolName: item.toolName,
    resourceType: item.resourceType,
    title: item.title,
    summary: item.summary,
    uncited: item.uncited,
  };
}

export type HeldInput = Omit<HeldProposal, "id">;

/**
 * Proposals waiting in one MCP session. The commit closure is the same
 * post-approval path a single-item approval runs: policy re-check, cited
 * version re-check, create, attribution.
 */
export class ProposalInbox {
  private seq = 0;
  private readonly items = new Map<string, HeldProposal>();

  hold(input: HeldInput): string {
    this.seq += 1;
    const id = `p${this.seq}`;
    this.items.set(id, { ...input, id });
    return id;
  }

  pendingIds(): string[] {
    return [...this.items.keys()];
  }

  listView(): {
    pending: number;
    groups: { patient: string; proposals: PendingProposalView[] }[];
    outcome: string;
  } {
    const groups = new Map<string, PendingProposalView[]>();
    for (const item of this.items.values()) {
      const patient = `Patient/${item.patientId}`;
      const list = groups.get(patient) ?? [];
      list.push(toView(item));
      groups.set(patient, list);
    }
    return {
      pending: this.items.size,
      groups: [...groups.entries()].map(([patient, proposals]) => ({
        patient,
        proposals,
      })),
      outcome:
        "Nothing in this list is saved. Each proposal stays pending until a person decides it. There is no approve-all.",
    };
  }

  /**
   * Apply explicit decisions. Items absent from the map stay pending.
   * One commit throwing or returning saved:false does not stop the rest.
   */
  async apply(decisions: ReadonlyMap<string, BatchItemDecision>): Promise<BatchSubmitResult> {
    const results: BatchItemResult[] = [];
    for (const item of [...this.items.values()]) {
      const decision = decisions.get(item.id);
      if (!decision) continue;
      this.items.delete(item.id);
      if (decision === "decline") {
        results.push({
          id: item.id,
          decision,
          saved: false,
          outcome: BATCH_DECLINE_OUTCOME,
        });
        continue;
      }
      try {
        const committed = await item.commit();
        const saved = committed.saved === true;
        results.push({
          id: item.id,
          decision,
          saved,
          ...(typeof committed.outcome === "string" ? { outcome: committed.outcome } : {}),
          ...(typeof committed.resourceType === "string"
            ? { resourceType: committed.resourceType }
            : {}),
          ...(saved && typeof committed.id === "string" ? { resourceId: committed.id } : {}),
        });
      } catch {
        results.push({
          id: item.id,
          decision,
          saved: false,
          outcome: BATCH_ITEM_FAILURE_OUTCOME,
        });
      }
    }
    const pending = this.pendingIds();
    const saved = results.some((item) => item.saved);
    return {
      submitted: true,
      saved,
      results,
      pending,
      outcome: saved
        ? "Submitted. Each result below is that proposal only. Proposals left unset are still pending."
        : "Submitted. Nothing new was saved. Proposals left unset are still pending.",
    };
  }

  async review(requestForm: RequestBatchForm | undefined): Promise<BatchSubmitResult> {
    const pending = [...this.items.values()].map(toView);
    const pendingIds = pending.map((item) => item.id);
    if (pending.length === 0) {
      return {
        submitted: false,
        saved: false,
        results: [],
        pending: [],
        outcome: "No proposals are waiting for review.",
      };
    }
    if (!requestForm) {
      return {
        submitted: false,
        saved: false,
        results: [],
        pending: pendingIds,
        outcome:
          "Batch review could not be presented. Every proposal is still pending. Nothing was saved.",
      };
    }
    const form = await requestForm({
      message: batchReviewMessage(pending),
      requestedSchema: batchDecisionSchema(pending),
    });
    if (form.action !== "accept") {
      return {
        submitted: false,
        saved: false,
        results: [],
        pending: pendingIds,
        outcome:
          "Batch review was not submitted. Every proposal is still pending. Nothing was saved.",
      };
    }
    const resolved = resolveBatchDecisions(pendingIds, form.content);
    if (!resolved.ok) {
      return {
        submitted: false,
        saved: false,
        results: [],
        pending: pendingIds,
        outcome: resolved.outcome,
      };
    }
    return this.apply(resolved.decisions);
  }
}
