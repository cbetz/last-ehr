import { describe, expect, it } from "vitest";

import { evidenceVersion } from "./evidence-version.js";

describe("evidence version tokens", () => {
  const row = {
    resourceType: "Observation",
    id: "hr-1",
    status: "final",
    valueQuantity: { value: 72, unit: "/min" },
  };

  it("prefers meta.versionId over meta.lastUpdated", () => {
    expect(
      evidenceVersion({
        ...row,
        meta: { versionId: "7", lastUpdated: "2026-01-02T00:00:00.000Z" },
      }),
    ).toEqual({ source: "versionId", token: "versionId:7" });
  });

  it("uses meta.lastUpdated when there is no version id", () => {
    expect(
      evidenceVersion({
        ...row,
        meta: { lastUpdated: "2026-01-02T00:00:00.000Z" },
      }),
    ).toEqual({
      source: "lastUpdated",
      token: "lastUpdated:2026-01-02T00:00:00.000Z",
    });
  });

  it("hashes the resource when a backend has neither meta field", () => {
    const forward = evidenceVersion({ b: 1, a: { d: 2, c: [3, 1] }, ...row });
    const reordered = evidenceVersion({
      ...row,
      a: { c: [3, 1], d: 2 },
      b: 1,
    });
    expect(forward?.source).toBe("content");
    expect(forward?.token).toMatch(/^content:[a-f0-9]{64}$/);
    expect(reordered).toEqual(forward);

    const changed = evidenceVersion({ ...row, valueQuantity: { value: 90, unit: "/min" } });
    expect(changed?.token).not.toBe(forward?.token);
  });
});
