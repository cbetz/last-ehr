import { afterEach, describe, expect, it, vi } from "vitest";

import { listStagedWrites } from "./dry-run-write";
import {
  adjustOracleHealthSearchParams,
  OracleHealthBackend,
  ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL,
} from "./oracle-health";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Oracle Health open-sandbox adapter", () => {
  it("drops _count when _id is present and leaves every other search alone", () => {
    expect(
      adjustOracleHealthSearchParams({ _id: "12742400", _count: "1" }),
    ).toEqual({ _id: "12742400" });
    expect(
      adjustOracleHealthSearchParams({
        patient: "12742400",
        _count: "1",
        category: "vital-signs",
      }),
    ).toEqual({
      patient: "12742400",
      _count: "1",
      category: "vital-signs",
    });
  });

  it("searches the open sandbox with structured params and no auth header", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({ resourceType: "Bundle", type: "searchset", entry: [] }),
        ),
    });
    const backend = new OracleHealthBackend({ fetch });

    await backend.search("Patient", { _id: "12742400", _count: "1" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${ORACLE_HEALTH_OPEN_SANDBOX_BASE_URL}/Patient?_id=12742400`,
    );
    const headers = new Headers(init.headers);
    expect(headers.get("accept")).toBe("application/fhir+json");
    expect(headers.get("authorization")).toBeNull();
  });

  it("stages a proposed create and does not POST", async () => {
    const fetch = vi.fn();
    const backend = new OracleHealthBackend({ fetch });
    const resource = {
      resourceType: "Observation" as const,
      status: "final" as const,
      code: { text: "Adapter probe" },
    };

    await expect(backend.createResource(resource)).rejects.toMatchObject({
      code: "FHIR_DRY_RUN",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(listStagedWrites(backend)[0]?.resource).toEqual(resource);
    expect(backend.writeDisposition).toBe("dry-run");
  });

  it("refuses delete without sending it", async () => {
    const fetch = vi.fn();
    const backend = new OracleHealthBackend({ fetch });

    await expect(
      backend.deleteResource("Observation", "obs-1"),
    ).rejects.toMatchObject({ code: "FHIR_READ_ONLY" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
