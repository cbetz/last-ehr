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

  // Safety boundary: fetch's defaults let a configured server choose the
  // destination (redirect: "follow"), the duration (no signal), and the
  // memory (unbounded body). The base URL here is local and no-auth, but the
  // same client is what an operator points at their own server.
  it("revokes fetch's destination and duration defaults on reads and writes", async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ resourceType: "Patient", id: "p1" })),
    ) as unknown as typeof globalThis.fetch;
    const client = new HapiReadClient("http://localhost:8080/fhir", fetchFn);

    await client.search("Patient", { name: "smith" });
    await client.createResource({ resourceType: "Patient" });

    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [, init] of calls as [string, RequestInit][]) {
      expect(init.redirect).toBe("manual");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("refuses a redirect on a write rather than following its Location", async () => {
    // createResource falls back to the Location header for a server-assigned
    // id, so a 3xx must be rejected before that fallback can read it.
    const fetchFn = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: "http://attacker.example/Patient/injected" },
        }),
    ) as unknown as typeof globalThis.fetch;
    const client = new HapiReadClient("http://localhost:8080/fhir", fetchFn);

    const failure = await client.createResource({ resourceType: "Patient" }).then(
      () => {
        throw new Error("expected the create to fail");
      },
      (error: unknown) => error as Error & { statusCode?: number },
    );
    expect(failure.statusCode).toBe(307);
    expect(failure.message).not.toContain("attacker.example");
    expect(failure.message).not.toContain("injected");
  });
});
