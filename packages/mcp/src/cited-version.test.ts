import { describe, expect, it } from "vitest";

import { confirmEvidencePins, prepareEvidencePins } from "./cited-version.js";
import { rememberFetchedResource } from "./evidence-version.js";
import { SessionReadLog } from "./proposal-evidence.js";

function observation(versionId: string) {
  return {
    resourceType: "Observation" as const,
    id: "hr-1",
    status: "final" as const,
    meta: { versionId },
  };
}

describe("cited evidence pins", () => {
  it("does not read when the proposal cites nothing", async () => {
    let calls = 0;
    const prepared = await prepareEvidencePins({
      client: {
        async searchResources() {
          calls += 1;
          return [];
        },
      },
      cited: [],
    });
    expect(prepared).toEqual({ ok: true, pins: [] });
    expect(calls).toBe(0);
    expect(await confirmEvidencePins({ async searchResources() { return []; } }, [])).toEqual({
      ok: true,
      pins: [],
    });
  });

  it("confirms a search-only client and refuses a changed versionId", async () => {
    let version = "1";
    const client = {
      async searchResources() {
        return [observation(version)];
      },
    };
    const prepared = await prepareEvidencePins({
      client,
      cited: [{ reference: "Observation/hr-1" }],
    });
    expect(prepared.ok).toBe(true);
    version = "2";
    const confirmed = await confirmEvidencePins(client, prepared.ok ? prepared.pins : []);
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) {
      expect(confirmed.outcome).toContain("Cited resource Observation/hr-1 changed");
      expect(confirmed.outcome).toContain("Nothing was saved");
    }
  });

  it("uses readResource when search throws, which is the Epic-shaped path", async () => {
    let version = "1";
    let reads = 0;
    const client = {
      async searchResources() {
        throw Object.assign(new Error("search is not permitted"), { statusCode: 403 });
      },
      async readResource() {
        reads += 1;
        return observation(version);
      },
    };
    const prepared = await prepareEvidencePins({
      client,
      cited: [{ reference: "Observation/hr-1" }],
    });
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.pins[0]?.version).toEqual({ source: "versionId", token: "versionId:1" });
    }
    version = "2";
    const confirmed = await confirmEvidencePins(client, prepared.ok ? prepared.pins : []);
    expect(reads).toBe(2);
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) expect(confirmed.outcome).toContain("changed");
  });

  it("treats an empty search as missing and does not call readResource", async () => {
    let reads = 0;
    const client = {
      async searchResources() {
        return [];
      },
      async readResource() {
        reads += 1;
        return observation("1");
      },
    };
    const prepared = await prepareEvidencePins({
      client,
      cited: [{ reference: "Observation/hr-1" }],
    });
    expect(prepared.ok && prepared.pins[0]?.version).toBeNull();
    expect(reads).toBe(0);
    const confirmed = await confirmEvidencePins(client, prepared.ok ? prepared.pins : []);
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) expect(confirmed.outcome).toContain("missing or was deleted");
    expect(reads).toBe(0);
  });

  it("classifies a direct read 404 and an OperationOutcome not-found as missing", async () => {
    const notFound = {
      async searchResources() {
        throw new Error("search unavailable");
      },
      async readResource() {
        throw Object.assign(new Error("gone"), { statusCode: 404 });
      },
    };
    const outcome = {
      async searchResources() {
        throw new Error("search unavailable");
      },
      async readResource() {
        throw { outcome: { issue: [{ code: "not-found" }] } };
      },
    };
    for (const client of [notFound, outcome]) {
      const prepared = await prepareEvidencePins({
        client,
        cited: [{ reference: "Observation/hr-1" }],
      });
      expect(prepared.ok && prepared.pins[0]?.version).toBeNull();
    }
  });

  it("fails closed on a read error and does not echo the diagnostic", async () => {
    const prepared = await prepareEvidencePins({
      client: {
        async searchResources() {
          throw new Error("Patient/secret-row at http://internal");
        },
      },
      cited: [{ reference: "Observation/hr-1" }],
    });
    expect(prepared.ok).toBe(false);
    if (!prepared.ok) {
      expect(prepared.outcome).toContain("could not be read");
      expect(prepared.outcome).toContain("Nothing was saved");
      expect(prepared.outcome).not.toContain("secret-row");
      expect(prepared.outcome).not.toContain("internal");
    }
  });

  it("keeps the session's version when the server has already moved on", async () => {
    const log = new SessionReadLog();
    rememberFetchedResource(log, observation("1"));
    let calls = 0;
    const prepared = await prepareEvidencePins({
      client: {
        async searchResources() {
          calls += 1;
          return [observation("9")];
        },
      },
      cited: [{ reference: "Observation/hr-1" }],
      readLog: log,
    });
    expect(calls).toBe(0);
    expect(prepared.ok && prepared.pins[0]?.version).toEqual({
      source: "versionId",
      token: "versionId:1",
    });
  });

  it("pins a supersession target from the resource already fetched", async () => {
    const prepared = await prepareEvidencePins({
      client: {
        async searchResources() {
          return [observation("9")];
        },
      },
      cited: [],
      known: [{ reference: "Observation/hr-1", resource: observation("4") }],
      also: [{ reference: "Observation/hr-1", role: "supersedes" }],
    });
    expect(prepared.ok && prepared.pins).toEqual([
      {
        reference: "Observation/hr-1",
        role: "supersedes",
        version: { source: "versionId", token: "versionId:4" },
      },
    ]);
    const confirmed = await confirmEvidencePins(
      { async searchResources() { return []; } },
      prepared.ok ? prepared.pins : [],
    );
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) {
      expect(confirmed.outcome).toContain("nothing to supersede");
      expect(confirmed.outcome).toContain("Nothing was saved");
    }
  });
});
