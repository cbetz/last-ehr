import { createHash, randomUUID } from "node:crypto";

import { WorkConnectorError } from "./connector-client";
import { workContextSchema, type WorkAssistantContext } from "./context";
import type { WorkActor } from "./service";

export type WorkContextReceiptIdentity = {
  principal: string;
  actor: WorkActor;
  expiresAt: number;
};
export type WorkContextReadTicket = Readonly<{ key: string; generation: string }>;
export type WorkContextReceipt = { context: WorkAssistantContext; contextReceipt: string };
export type WorkContextReceiptStore = {
  begin(identity: WorkContextReceiptIdentity): WorkContextReadTicket;
  complete(ticket: WorkContextReadTicket, context: WorkAssistantContext): WorkContextReceipt;
  get(identity: WorkContextReceiptIdentity, receipt: string): WorkAssistantContext;
  invalidate(ticket: WorkContextReadTicket): void;
  invalidateReceipt(identity: WorkContextReceiptIdentity, receipt: string): void;
  close(): void;
};

type Entry = {
  generation: string;
  startedAt: number;
  expiresAt: number;
  context?: WorkAssistantContext;
  receipt?: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const actorPart = /^[A-Za-z0-9._:@/-]{1,160}$/;
const required = () => new WorkConnectorError("context_required");

/** Bounded read proofs survive transport reconnects, never an identity change. */
export function createWorkContextReceiptStore(options: {
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
} = {}): WorkContextReceiptStore {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const maxEntries = options.maxEntries ?? 64;
  if (typeof now !== "function" || !Number.isSafeInteger(ttlMs) || ttlMs < 1 ||
    !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("Work context receipt limits are invalid.");
  const entries = new Map<string, Entry>();
  let closed = false;

  const clock = () => {
    const at = now();
    if (!Number.isSafeInteger(at) || at < 0) throw required();
    return at;
  };
  const sweep = (at: number) => {
    for (const [key, entry] of entries) if (entry.expiresAt <= at || entry.startedAt > at) entries.delete(key);
  };
  const binding = (identity: WorkContextReceiptIdentity, at: number): string => {
    if (!identity || typeof identity.principal !== "string" || identity.principal.length < 1 || identity.principal.length > 512 ||
      identity.actor?.role !== "assistant" || typeof identity.actor.tenantId !== "string" || !actorPart.test(identity.actor.tenantId) ||
      typeof identity.actor.subject !== "string" || !actorPart.test(identity.actor.subject) ||
      !Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= at) throw required();
    return createHash("sha256").update(JSON.stringify([identity.principal, identity.actor.tenantId, identity.actor.subject])).digest("hex");
  };
  const current = (ticket: WorkContextReadTicket, at: number): Entry => {
    const entry = ticket && typeof ticket.key === "string" ? entries.get(ticket.key) : undefined;
    if (!entry || entry.generation !== ticket.generation || entry.expiresAt <= at || entry.startedAt > at) throw required();
    return entry;
  };

  return {
    begin(identity) {
      if (closed) throw required();
      const at = clock();
      const key = binding(identity, at);
      sweep(at);
      // Reserve capacity before the asynchronous reader starts. Replacing this
      // binding invalidates its old receipt and all older pending completions.
      if (!entries.has(key) && entries.size >= maxEntries) throw new WorkConnectorError("unavailable");
      const generation = randomUUID();
      const expiresAt = at + Math.min(ttlMs, identity.expiresAt - at);
      entries.set(key, { generation, startedAt: at, expiresAt });
      return Object.freeze({ key, generation });
    },
    complete(ticket, context) {
      if (closed) throw required();
      const at = clock();
      sweep(at);
      const entry = current(ticket, at);
      if (entry.receipt !== undefined) throw required();
      const parsed = workContextSchema.safeParse(context);
      if (!parsed.success) {
        if (entries.get(ticket.key) === entry) entries.delete(ticket.key);
        throw new WorkConnectorError("invalid_response");
      }
      // Recheck after parsing too: a new read/close must never be undone by a
      // stale completion, including a synchronously reentrant reader value.
      if (closed) throw required();
      const completedAt = clock();
      sweep(completedAt);
      if (current(ticket, completedAt) !== entry) throw required();
      const stored = structuredClone(parsed.data);
      const receipt = randomUUID();
      entry.context = stored;
      entry.receipt = receipt;
      return { context: structuredClone(stored), contextReceipt: receipt };
    },
    get(identity, receipt) {
      if (closed) throw required();
      const at = clock();
      const key = binding(identity, at);
      sweep(at);
      const entry = entries.get(key);
      if (typeof receipt !== "string" || !uuid.test(receipt) || !entry?.context || entry.receipt !== receipt) throw required();
      return structuredClone(entry.context);
    },
    invalidate(ticket) {
      if (closed || !ticket || typeof ticket.key !== "string") return;
      const entry = entries.get(ticket.key);
      if (entry?.generation === ticket.generation) entries.delete(ticket.key);
    },
    invalidateReceipt(identity, receipt) {
      if (closed) return;
      const at = clock();
      sweep(at);
      let key: string;
      try { key = binding(identity, at); } catch { return; }
      const entry = entries.get(key);
      if (typeof receipt === "string" && uuid.test(receipt) && entry?.receipt === receipt) entries.delete(key);
    },
    close() {
      closed = true;
      entries.clear();
    },
  };
}
