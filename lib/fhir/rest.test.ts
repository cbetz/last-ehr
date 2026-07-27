import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { FhirRestBackend } from "./rest";

// These are safety-boundary tests. The transport builds every URL it fetches
// from a configured base plus a ResourceType-derived path, which makes it easy
// to assume a configured server cannot steer it — but fetch's defaults hand
// that server control over the destination (redirect: "follow"), the duration
// (no signal), and the memory (an unbounded body read).

const stream = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/fhir+json" },
  });

const backendWith = (fetchFn: typeof globalThis.fetch) =>
  new FhirRestBackend({ baseUrl: "https://fhir.example.org/fhir", fetch: fetchFn });

describe("FhirRestBackend transport hardening", () => {
  it("revokes fetch's destination and duration defaults on every request", async () => {
    // One stub for all three verbs: a search reads `entry`, a create reads
    // the returned representation's id, a delete reads nothing.
    const fetchFn = vi.fn(async () =>
      jsonResponse({ resourceType: "Patient", id: "p1", entry: [] }),
    ) as unknown as typeof globalThis.fetch;
    const backend = backendWith(fetchFn);

    await backend.search("Patient", { name: "smith" });
    await backend.createResource({ resourceType: "Patient", id: "p1" });
    await backend.deleteResource("Patient", "p1");

    const calls = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    for (const [, init] of calls as [string, RequestInit][]) {
      expect(init.redirect).toBe("manual");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("refuses a redirect instead of following it, and names no host", async () => {
    // A server that can 302 an ordinary search picks which host answers it.
    // The response body would then enter the chart as the FHIR server's.
    const fetchFn = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    ) as unknown as typeof globalThis.fetch;

    const err = await backendWith(fetchFn)
      .search("Patient", { name: "smith" })
      .then(
        () => undefined,
        (e: Error) => e,
      );

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ statusCode: 302 });
    // Errors reach logs and the dev panel; a redirect target is a host.
    expect(err?.message).not.toContain("169.254.169.254");
    expect(err?.message).not.toContain("http://");
  });

  it("caps the response body instead of buffering whatever a server sends", async () => {
    const oneMiB = new Uint8Array(1024 * 1024).fill(0x20);
    const fetchFn = vi.fn(
      async () =>
        new Response(stream(Array.from({ length: 20 }, () => oneMiB)), {
          status: 200,
        }),
    ) as unknown as typeof globalThis.fetch;

    await expect(
      backendWith(fetchFn).search("Patient", { name: "smith" }),
    ).rejects.toThrow(/exceeded the .*-byte ceiling/);
  });

  it("still decodes a normal body whose multi-byte characters span chunks", async () => {
    // The capped read decodes incrementally, so a UTF-8 sequence split across
    // two chunks must not be mangled into a replacement character.
    const payload = new TextEncoder().encode(
      JSON.stringify({ resourceType: "Patient", id: "p1", name: [{ family: "Ámáyá" }] }),
    );
    const split = 12;
    const fetchFn = vi.fn(
      async () =>
        new Response(stream([payload.slice(0, split), payload.slice(split)]), {
          status: 200,
        }),
    ) as unknown as typeof globalThis.fetch;

    const created = await backendWith(fetchFn).createResource({
      resourceType: "Patient",
    });
    expect(created).toMatchObject({ id: "p1", name: [{ family: "Ámáyá" }] });
  });
});

describe("hardening is applied at every FHIR fetch site", () => {
  // The web app, @lastehr/mcp, and @lastehr/agent-write-conformance each own
  // their own fetch. The two packages are published separately and depend on
  // nothing in lib/ by design (conformance has exactly two dependencies), so
  // the hardening cannot be shared — it is duplicated. A duplicated security
  // control drifts unless something fails when one copy is missed, and a
  // behavioral test in one suite cannot see the other packages' sources.
  const sites = [
    "lib/fhir/rest.ts",
    "packages/mcp/src/hapi.ts",
    "packages/conformance/src/probe.ts",
  ];

  it.each(sites)("%s refuses redirects and bounds the request", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain('redirect: "manual"');
    expect(source).toMatch(/AbortSignal\.timeout\(/);
    // Every 3xx must be turned into a failure; "manual" only stops the follow.
    expect(source).toMatch(/status >= 300 && \w+\.status < 400/);
  });

  it.each(["lib/fhir/rest.ts", "packages/mcp/src/hapi.ts"])(
    "%s reads no response body without a byte ceiling",
    (file) => {
      const source = readFileSync(file, "utf8");
      // The capped readers keep their own res.text()/res.json() fallback for
      // stream-less test doubles; outside those, a bare read is the bug.
      const bare = source
        .split("\n")
        .filter((line) => /await res(ponse)?\.(text|json)\(\)/.test(line))
        .filter((line) => !/!res\.body/.test(line));
      expect(bare).toEqual([]);
    },
  );
});
