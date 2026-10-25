import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { WorkConnectorError } from "./connector-client";
import type { WorkAssistantContext } from "./context";
import { createWorkContextReceiptStore, type WorkContextReceiptIdentity } from "./context-receipts";

const chart: WorkAssistantContext = {
  patient: { reference: "Patient/synthetic", label: "Alex Synthetic Worklab", dateOfBirth: "2000-01-01" },
  observation: { reference: "Observation/synthetic", versionId: "1", label: "Invented result", value: 6.4, unit: "%", effectiveDateTime: "2026-01-01T12:00:00Z" },
};
function rig(options: { ttlMs?: number; maxEntries?: number } = {}) {
  let at = 1_700_000_000_000;
  const store = createWorkContextReceiptStore({ ...options, now: () => at });
  const identity: WorkContextReceiptIdentity = {
    principal: "verified-principal-one", actor: { tenantId: "synthetic-work-lab", subject: "assistant-one", role: "assistant" },
    expiresAt: at + 60 * 60_000,
  };
  return { store, identity, now: () => at, advance: (ms: number) => { at += ms; } };
}
function requireContext(operation: () => unknown) {
  let failure: unknown;
  try { operation(); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(WorkConnectorError);
  expect(failure).toMatchObject({ code: "context_required" });
}

describe("bounded Work chart read receipts", () => {
  it("issues an opaque receipt only after a successful read and reuses it for the same verified identity", () => {
    const { store, identity } = rig();
    requireContext(() => store.get(identity, randomUUID()));
    const ticket = store.begin(identity);
    expect(Object.isFrozen(ticket)).toBe(true);
    expect(ticket.key).toMatch(/^[a-f0-9]{64}$/);
    expect(ticket.generation).toMatch(/^[a-f0-9-]{36}$/);
    requireContext(() => store.get(identity, ticket.generation));
    const completed = store.complete(ticket, chart);
    expect(completed).toEqual({ context: chart, contextReceipt: expect.stringMatching(/^[a-f0-9-]{36}$/) });
    expect(completed.contextReceipt).not.toBe(ticket.generation);
    expect(JSON.stringify(ticket)).not.toContain(identity.principal);
    expect(JSON.stringify(ticket)).not.toContain(identity.actor.subject);
    expect(store.get(structuredClone(identity), completed.contextReceipt)).toEqual(chart);
    expect(store.get(identity, completed.contextReceipt)).toEqual(chart);
    requireContext(() => store.complete(ticket, chart));
    expect(store.get(identity, completed.contextReceipt)).toEqual(chart);
  });

  it("binds receipts independently to principal, tenant and assistant subject", () => {
    const { store, identity } = rig();
    const result = store.complete(store.begin(identity), chart);
    const foreign: WorkContextReceiptIdentity[] = [
      { ...identity, principal: "verified-principal-two" },
      { ...identity, actor: { ...identity.actor, tenantId: "another-tenant" } },
      { ...identity, actor: { ...identity.actor, subject: "assistant-two" } },
      { ...identity, actor: { ...identity.actor, role: "reviewer" } },
    ];
    for (const other of foreign) {
      requireContext(() => store.get(other, result.contextReceipt));
      store.invalidateReceipt(other, result.contextReceipt);
      expect(store.get(identity, result.contextReceipt)).toEqual(chart);
    }
  });

  it("does not invalidate a real receipt when missing, malformed, forged or superseded values are presented", () => {
    const { store, identity } = rig();
    const old = store.complete(store.begin(identity), chart);
    const newer = store.complete(store.begin(identity), chart);
    for (const value of ["", "not-a-receipt", "x".repeat(16_000), randomUUID(), old.contextReceipt]) {
      requireContext(() => store.get(identity, value));
      store.invalidateReceipt(identity, value);
      expect(store.get(identity, newer.contextReceipt)).toEqual(chart);
    }
    store.invalidateReceipt(identity, newer.contextReceipt);
    requireContext(() => store.get(identity, newer.contextReceipt));
  });

  it("expires at five minutes from read start, without extending expiry on completion or repeated use", () => {
    const { store, identity, advance } = rig();
    const ticket = store.begin(identity);
    advance(60_000);
    const result = store.complete(ticket, chart);
    advance(5 * 60_000 - 60_000 - 1);
    expect(store.get(identity, result.contextReceipt)).toEqual(chart);
    advance(1);
    requireContext(() => store.get(identity, result.contextReceipt));
  });

  it("caps the receipt at the originating token expiry even with a renewed token for the same identity", () => {
    const { store, identity, now, advance } = rig();
    const original = { ...identity, expiresAt: now() + 10_000 };
    const result = store.complete(store.begin(original), chart);
    const renewed = { ...identity, expiresAt: now() + 60 * 60_000 };
    advance(9_999);
    expect(store.get(renewed, result.contextReceipt)).toEqual(chart);
    advance(1);
    requireContext(() => store.get(renewed, result.contextReceipt));
    const fresh = store.complete(store.begin(renewed), chart);
    expect(store.get(renewed, fresh.contextReceipt)).toEqual(chart);
  });

  it("also rejects an expired caller token while the original receipt is still valid", () => {
    const { store, identity, now } = rig();
    const result = store.complete(store.begin(identity), chart);
    requireContext(() => store.get({ ...identity, expiresAt: now() }, result.contextReceipt));
    expect(store.get(identity, result.contextReceipt)).toEqual(chart);
  });

  it("invalidates earlier successful and pending reads as soon as a new read begins", () => {
    const { store, identity } = rig();
    const firstTicket = store.begin(identity);
    const first = store.complete(firstTicket, chart);
    const secondTicket = store.begin(identity);
    requireContext(() => store.get(identity, first.contextReceipt));
    const thirdTicket = store.begin(identity);
    requireContext(() => store.complete(secondTicket, chart));
    const changed = { ...chart, observation: { ...chart.observation, versionId: "2" } };
    const third = store.complete(thirdTicket, changed);
    store.invalidate(firstTicket);
    store.invalidate(secondTicket);
    expect(store.get(identity, third.contextReceipt)).toEqual(changed);
    requireContext(() => store.complete(firstTicket, chart));
    expect(store.get(identity, third.contextReceipt)).toEqual(changed);
  });

  it("never restores an older delayed read after a newer refresh fails", () => {
    const { store, identity } = rig();
    const oldTicket = store.begin(identity);
    const newerTicket = store.begin(identity);
    store.invalidate(newerTicket); // The newer asynchronous chart reader failed.
    requireContext(() => store.complete(oldTicket, chart));
    const next = store.complete(store.begin(identity), chart);
    store.invalidate(oldTicket); // A late failure callback cannot clear the new read.
    store.invalidate(newerTicket);
    expect(store.get(identity, next.contextReceipt)).toEqual(chart);
  });

  it("cannot overwrite or invalidate a newer generation started during response parsing", () => {
    for (const malformed of [false, true]) {
      const { store, identity } = rig();
      const oldTicket = store.begin(identity);
      let latestTicket = oldTicket;
      const value = { ...chart, ...(malformed ? { observation: { ...chart.observation, versionId: "" } } : {}) };
      Object.defineProperty(value, "patient", {
        enumerable: true,
        get: () => { latestTicket = store.begin(identity); return chart.patient; },
      });
      if (malformed) expect(() => store.complete(oldTicket, value)).toThrow(expect.objectContaining({ code: "invalid_response" }));
      else requireContext(() => store.complete(oldTicket, value));
      const latest = store.complete(latestTicket, chart);
      expect(store.get(identity, latest.contextReceipt)).toEqual(chart);
    }
  });

  it("reserves capacity for pending reads, replaces only the same binding, and reclaims expired entries", () => {
    const { store, identity, advance } = rig({ maxEntries: 1, ttlMs: 100 });
    const firstTicket = store.begin(identity);
    const foreign = { ...identity, principal: "foreign-principal" };
    expect(() => store.begin(foreign)).toThrow(expect.objectContaining({ code: "unavailable" }));
    const replacementTicket = store.begin(identity);
    requireContext(() => store.complete(firstTicket, chart));
    const replacement = store.complete(replacementTicket, chart);
    expect(() => store.begin(foreign)).toThrow(expect.objectContaining({ code: "unavailable" }));
    expect(store.get(identity, replacement.contextReceipt)).toEqual(chart);
    advance(100);
    const foreignRead = store.complete(store.begin(foreign), chart);
    expect(store.get(foreign, foreignRead.contextReceipt)).toEqual(chart);
    requireContext(() => store.get(identity, replacement.contextReceipt));
  });

  it("bounds the default pending-read capacity at 64 without discarding another principal's valid receipt", () => {
    const { store, identity } = rig();
    const first = store.complete(store.begin(identity), chart);
    const pending = Array.from({ length: 63 }, (_, index) => store.begin({ ...identity, principal: `other-principal-${index}` }));
    expect(() => store.begin({ ...identity, principal: "overflow-principal" })).toThrow(expect.objectContaining({ code: "unavailable" }));
    expect(store.get(identity, first.contextReceipt)).toEqual(chart);
    store.invalidate(pending[0]);
    expect(() => store.begin({ ...identity, principal: "overflow-principal" })).not.toThrow();
  });

  it("rejects completion after pending expiry and cannot reuse a generation after that binding is recreated", () => {
    const { store, identity, advance } = rig({ ttlMs: 10 });
    const expired = store.begin(identity);
    advance(10);
    requireContext(() => store.complete(expired, chart));
    const freshTicket = store.begin(identity);
    expect(freshTicket.generation).not.toBe(expired.generation);
    const fresh = store.complete(freshTicket, chart);
    store.invalidate(expired);
    requireContext(() => store.complete(expired, chart));
    expect(store.get(identity, fresh.contextReceipt)).toEqual(chart);
  });

  it("clones input, completed output and each retrieved chart, retaining no mutable caller identity", () => {
    const { store, identity } = rig();
    const originalIdentity = structuredClone(identity);
    const input = structuredClone(chart);
    const result = store.complete(store.begin(identity), input);
    input.observation.versionId = "input-mutated";
    result.context.patient.label = "output-mutated";
    const first = store.get(originalIdentity, result.contextReceipt);
    first.observation.versionId = "retrieval-mutated";
    identity.actor.subject = "changed-caller-subject";
    identity.principal = "changed-caller-principal";
    identity.expiresAt = 0;
    expect(store.get(originalIdentity, result.contextReceipt)).toEqual(chart);
    requireContext(() => store.get(identity, result.contextReceipt));
  });

  it("rejects malformed chart responses and leaves the failed refresh without a usable receipt", () => {
    const { store, identity } = rig();
    const prior = store.complete(store.begin(identity), chart);
    const ticket = store.begin(identity);
    expect(() => store.complete(ticket, { ...chart, privateCredential: "not-chart-data" } as WorkAssistantContext)).toThrow(expect.objectContaining({ code: "invalid_response" }));
    requireContext(() => store.get(identity, prior.contextReceipt));
    requireContext(() => store.complete(ticket, chart));
  });

  it("closes pending and completed reads permanently and requires a new read in a new store", () => {
    const { store, identity, now } = rig();
    const ticket = store.begin(identity);
    const completed = store.complete(ticket, chart);
    const pending = store.begin({ ...identity, principal: "another-principal" });
    store.close();
    store.close();
    requireContext(() => store.get(identity, completed.contextReceipt));
    requireContext(() => store.complete(pending, chart));
    requireContext(() => store.begin(identity));
    expect(() => store.invalidate(ticket)).not.toThrow();
    expect(() => store.invalidateReceipt(identity, completed.contextReceipt)).not.toThrow();
    const restarted = createWorkContextReceiptStore({ now });
    requireContext(() => restarted.get(identity, completed.contextReceipt));
    expect(restarted.complete(restarted.begin(identity), chart).contextReceipt).not.toBe(completed.contextReceipt);
  });

  it("fails closed for invalid limits, clocks, actor roles and expiration values", () => {
    for (const options of [{ ttlMs: 0 }, { ttlMs: -1 }, { ttlMs: 1.1 }, { ttlMs: Number.NaN }, { maxEntries: 0 }, { maxEntries: -1 }, { maxEntries: Number.POSITIVE_INFINITY }]) {
      expect(() => createWorkContextReceiptStore(options)).toThrow("Work context receipt limits are invalid.");
    }
    const { identity, now } = rig();
    for (const at of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.1]) {
      const store = createWorkContextReceiptStore({ now: () => at });
      requireContext(() => store.begin(identity));
    }
    const store = createWorkContextReceiptStore({ now });
    for (const value of [
      { ...identity, principal: "" },
      { ...identity, principal: "x".repeat(513) },
      { ...identity, actor: { ...identity.actor, role: "reviewer" as const } },
      { ...identity, actor: { ...identity.actor, subject: "" } },
      { ...identity, expiresAt: now() },
      { ...identity, expiresAt: Number.NaN },
      { ...identity, expiresAt: Number.POSITIVE_INFINITY },
    ]) requireContext(() => store.begin(value));
  });
});
