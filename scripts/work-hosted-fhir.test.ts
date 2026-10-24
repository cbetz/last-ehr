import { describe, expect, it, vi } from "vitest";

import { validateWorkDemoFhirUrl } from "./work-demo-fhir";
import { createWorkHostedFhirAdapter, validateWorkHostedFhirUrl, WORK_HOSTED_FHIR_URL } from "./work-hosted-fhir";

type Resource = Record<string, unknown>;

function fakePrivateHapi() {
  const resources: Resource[] = [];
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const [, , type, id] = url.pathname.split("/");
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/fhir+json" } });
    if (type === "metadata") return json({
      resourceType: "CapabilityStatement",
      rest: [{ mode: "server", resource: ["Patient", "Observation", "Task"].map((type) => ({ type, conditionalCreate: true })) }],
    });
    if (id) {
      const resource = resources.find((resource) => resource.resourceType === type && resource.id === id);
      return resource ? json(resource) : new Response(null, { status: 404 });
    }
    const criterion = init.method === "POST"
      ? new URLSearchParams(new Headers(init.headers).get("If-None-Exist") ?? "").get("identifier")
      : url.searchParams.get("identifier");
    const [system, value] = (criterion ?? "").split("|");
    const matching = resources.filter((resource) => resource.resourceType === type && Array.isArray(resource.identifier) && resource.identifier.some((identifier) => identifier.system === system && identifier.value === value));
    if (init.method === "POST") {
      if (!criterion) throw new Error("Conditional creation required");
      const result = matching[0] ?? { ...JSON.parse(String(init.body)), id: `synthetic-${resources.length + 1}`, meta: { versionId: "1" } };
      if (!matching.length) resources.push(result);
      return json(result);
    }
    return json({ resourceType: "Bundle", type: "searchset", total: matching.length, entry: matching.map((resource) => ({ resource })) });
  };
  return { fetcher, calls, resources };
}

describe("hosted synthetic FHIR transport", () => {
  it("allows only the exact private service spelling in addition to the existing numeric loopback contract", () => {
    expect(validateWorkHostedFhirUrl(WORK_HOSTED_FHIR_URL)).toBe(WORK_HOSTED_FHIR_URL);
    expect(validateWorkHostedFhirUrl("http://127.0.0.1:8081/fhir/")).toBe("http://127.0.0.1:8081/fhir");
    expect(validateWorkHostedFhirUrl("http://[::1]:8080/fhir")).toBe("http://[::1]:8080/fhir");
    // Hosting must not relax the existing local lab's validator.
    expect(() => validateWorkDemoFhirUrl(WORK_HOSTED_FHIR_URL)).toThrow(/numeric loopback/);
  });

  it.each([
    "https://hapi:8080/fhir", "http://hapi/fhir", "http://hapi:8081/fhir",
    "http://HAPI:8080/fhir", "http://hapi:8080/fhir/", "http://hapi.:8080/fhir",
    "http://hapi.attacker.invalid:8080/fhir", "http://hapi:8080/fhir?token=secret",
    "http://hapi:8080/fhir#secret", "http://user:secret@hapi:8080/fhir",
    "http://hapi:8080/real-fhir", "http://hapi:8080/other/../fhir",
    "http://localhost:8080/fhir", "http://169.254.169.254/fhir",
    "http://2130706433:8080/fhir", "http://127.0.0.2:8080/fhir",
  ])("rejects an attacker-controlled or ambiguous backend before fetching: %s", (baseUrl) => {
    const fetcher = vi.fn<typeof fetch>();
    expect(() => createWorkHostedFhirAdapter({ baseUrl, fetch: fetcher })).toThrow(/private Compose HAPI URL/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("translates every fixture request and query to the private path while preserving bounded, credential-free conditional creation", async () => {
    const hapi = fakePrivateHapi();
    const adapter = createWorkHostedFhirAdapter({ fetch: hapi.fetcher });
    const fixture = await adapter.getFixture();
    expect((await adapter.readContext()).observation.reference).toBe(fixture.source.reference);
    expect(hapi.resources.map((resource) => resource.resourceType)).toEqual(["Patient", "Observation"]);
    expect(hapi.calls[0].url.toString()).toBe("http://hapi:8080/fhir/metadata");
    expect(hapi.calls.some(({ url }) => url.pathname === "/fhir/Patient" && url.searchParams.get("identifier")?.includes("synthetic-patient-v1"))).toBe(true);
    expect(hapi.calls.some(({ url }) => url.pathname === `/fhir/${fixture.source.reference}`)).toBe(true);
    const writes = hapi.calls.filter(({ init }) => init.method === "POST");
    expect(writes).toHaveLength(2);
    for (const { url, init } of hapi.calls) {
      expect(url.origin).toBe("http://hapi:8080");
      expect(url.pathname.startsWith("/fhir/")).toBe(true);
      expect(init.redirect).toBe("error");
      expect(init.credentials).toBe("omit");
      expect(init.cache).toBe("no-store");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
    }
    expect(writes.every(({ init }) => new Headers(init.headers).has("If-None-Exist"))).toBe(true);
  });

  it("translates to an explicitly allowed numeric loopback port without changing the request suffix", async () => {
    const calls: string[] = [];
    const adapter = createWorkHostedFhirAdapter({ baseUrl: "http://127.0.0.1:8099/fhir/", fetch: async (input) => {
      calls.push(String(input));
      return new Response(null, { status: 503 });
    } });
    await expect(adapter.getFixture()).rejects.toMatchObject({ code: "FHIR_UNAVAILABLE" });
    expect(calls).toEqual(["http://127.0.0.1:8099/fhir/metadata"]);
  });

  it("fails closed on a redirect and exposes no upstream location or credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      expect(init?.redirect).toBe("error");
      expect(init?.credentials).toBe("omit");
      return new Response(null, { status: 302, headers: { Location: "http://private:secret@attacker.invalid/" } });
    });
    const adapter = createWorkHostedFhirAdapter({ fetch: fetcher });
    await expect(adapter.getFixture()).rejects.toMatchObject({ code: "FHIR_UNAVAILABLE", message: "The local synthetic FHIR service is unavailable." });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
