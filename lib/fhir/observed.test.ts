import { describe, it, expect } from "vitest";
import type { Bundle, Observation, Patient } from "@medplum/fhirtypes";

import type { FhirBackend } from "@/lib/fhir/backend";
import { ObservedFhirBackend, type FhirDevEvent } from "@/lib/fhir/observed";

const SESSION_ID = "11111111-2222-3333-4444-555555555555";
const DIAGNOSTIC = "FHIR request failed: Patient/secret-id not permitted";

// A fake inner backend in the tools.test.ts injection style: happy-path
// searches/creates plus a failing resource type to exercise the error path.
function fakeBackend(): FhirBackend {
  const patient: Patient = { resourceType: "Patient", id: "p1" };
  const bundle: Bundle<Patient> = {
    resourceType: "Bundle",
    type: "searchset",
    entry: [
      { resource: patient, search: { mode: "match" } },
      // Non-match rows (OperationOutcome, _include) must not count.
      { search: { mode: "outcome" } },
    ],
  };
  return {
    async search(resourceType) {
      if (resourceType === "Observation") throw new Error(DIAGNOSTIC);
      return bundle as never;
    },
    async searchResources(resourceType) {
      if (resourceType === "Observation") throw new Error(DIAGNOSTIC);
      return [patient] as never;
    },
    async createResource(resource) {
      if (resource.resourceType === "Observation") throw new Error(DIAGNOSTIC);
      return { ...resource, id: "created-1" };
    },
    async deleteResource() {},
  };
}

function observed(events: FhirDevEvent[]): ObservedFhirBackend {
  return new ObservedFhirBackend(
    fakeBackend(),
    (event) => events.push(event),
    SESSION_ID,
  );
}

describe("ObservedFhirBackend", () => {
  it("emits one event per operation with method, path, and counts", async () => {
    const events: FhirDevEvent[] = [];
    const backend = observed(events);

    await backend.search("Patient", { name: "maria", _count: "20" });
    await backend.searchResources("Patient", { name: "maria" });
    const created = await backend.createResource({
      resourceType: "Patient",
    } as Patient);

    expect(created.id).toBe("created-1");
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      op: "search",
      method: "GET",
      path: "/Patient?name=maria&_count=20",
      ok: true,
      resultCount: 1, // match-mode rows only
    });
    expect(events[1]).toMatchObject({
      op: "searchResources",
      ok: true,
      resultCount: 1,
    });
    expect(events[2]).toMatchObject({
      op: "create",
      method: "POST",
      path: "/Patient",
      ok: true,
      resourceType: "Patient",
      resourceId: "created-1",
    });
    for (const event of events) {
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("passes arguments through untouched, meta.tag included", async () => {
    let seen: unknown;
    const inner = fakeBackend();
    inner.createResource = async (resource) => {
      seen = resource;
      return { ...resource, id: "x" };
    };
    const backend = new ObservedFhirBackend(inner, () => {}, SESSION_ID);
    const resource = {
      resourceType: "Patient",
      meta: { tag: [{ system: "http://lastehr.demo", code: `session-${SESSION_ID}` }] },
    } as Patient;
    await backend.createResource(resource);
    expect(seen).toBe(resource);
  });

  it("emits ok:false on failure and rethrows the original error", async () => {
    const events: FhirDevEvent[] = [];
    const backend = observed(events);
    await expect(backend.search("Observation")).rejects.toThrow(DIAGNOSTIC);
    await expect(
      backend.createResource({ resourceType: "Observation" } as Observation),
    ).rejects.toThrow(DIAGNOSTIC);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.ok === false)).toBe(true);
  });

  it("delegates deleteResource without an event (never agent-reachable)", async () => {
    const events: FhirDevEvent[] = [];
    await observed(events).deleteResource("Patient", "p1");
    expect(events).toHaveLength(0);
  });

  it("never leaks the session id, error text, auth, or hosts (safety boundary)", async () => {
    const events: FhirDevEvent[] = [];
    const backend = observed(events);

    // The exact param shapes searchVisible sends (lib/ai/tools.ts): the
    // HttpOnly demo_session_id rides in _tag/_tag:not values.
    await backend.searchResources("Patient", {
      _tag: `http://lastehr.demo|session-${SESSION_ID}`,
      "_tag:not": `http://lastehr.demo|session-${SESSION_ID}`,
      _count: "100",
    });
    await backend.search("Observation").catch(() => {});
    await backend
      .createResource({ resourceType: "Observation" } as Observation)
      .catch(() => {});

    const serialized = JSON.stringify(events);
    expect(events.length).toBeGreaterThan(0);
    expect(serialized).not.toContain(SESSION_ID);
    expect(serialized.toLowerCase()).not.toContain("authorization");
    expect(serialized.toLowerCase()).not.toContain("bearer");
    expect(serialized).not.toContain("secret-id");
    expect(serialized).not.toContain("not permitted");
    expect(serialized).not.toContain("http://localhost");
    // The tag filter itself stays visible; only the capability token goes.
    expect(serialized).toContain("session-redacted");
  });

  it("never lets a throwing event consumer break the chart operation", async () => {
    const backend = new ObservedFhirBackend(
      fakeBackend(),
      () => {
        throw new Error("consumer bug");
      },
      SESSION_ID,
    );
    await expect(backend.search("Patient")).resolves.toBeDefined();
  });
});
