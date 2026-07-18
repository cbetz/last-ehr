import { describe, expect, it, vi } from "vitest";

import { HapiReadClient } from "./hapi.js";

function stubFetch(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof globalThis.fetch;
}

describe("HapiReadClient", () => {
  it("searches with URL-encoded structured params and the FHIR media type", async () => {
    const fetchFn = stubFetch(200, { resourceType: "Bundle", entry: [] });
    const client = new HapiReadClient("http://localhost:8080/fhir/", fetchFn);
    await client.search("Patient", { name: "Smith & Sons", _count: "20" });

    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://localhost:8080/fhir/Patient?name=Smith+%26+Sons&_count=20",
    );
    expect(new Headers(init.headers).get("accept")).toBe(
      "application/fhir+json",
    );
  });

  it("returns only match-mode rows from searchResources", async () => {
    const fetchFn = stubFetch(200, {
      resourceType: "Bundle",
      entry: [
        {
          resource: { resourceType: "Patient", id: "p1" },
          search: { mode: "match" },
        },
        { search: { mode: "outcome" } },
        { resource: { resourceType: "Patient", id: "p2" } },
      ],
    });
    const client = new HapiReadClient("http://localhost:8080/fhir", fetchFn);
    const rows = await client.searchResources("Patient", { name: "smith" });
    expect(rows.map((row) => row.id)).toEqual(["p1", "p2"]);
  });

  it("fails with the HTTP status only — no response-body diagnostics", async () => {
    const fetchFn = stubFetch(400, {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", diagnostics: "secret-diagnostic" }],
    });
    const client = new HapiReadClient("http://localhost:8080/fhir", fetchFn);
    const failure = await client.search("Patient").then(
      () => {
        throw new Error("expected the search to fail");
      },
      (error: unknown) => error as Error & { statusCode?: number },
    );
    expect(failure.message).toBe("FHIR request failed: HTTP 400");
    expect(failure.statusCode).toBe(400);
    expect(failure.message).not.toContain("secret-diagnostic");
  });
});
