import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createSeededMemoryClient } from "./memory-seed.js";
import { MemoryFhirClient } from "./memory.js";
import { buildInstructions, buildMcpServer } from "./server.js";
import { MEMORY_WRITE_NOTICE } from "./write-tools.js";

describe("in-memory FHIR search", () => {
  it("matches a multi-word name when each word matches a name part", async () => {
    const client = await createSeededMemoryClient();
    const found = await client.searchResources("Patient", { name: "Maria Garcia" });
    expect(found.map((patient) => patient.name?.[0]?.family)).toEqual(["Garcia"]);

    const smiths = await client.searchResources("Patient", { name: "Smith" });
    expect(smiths.map((patient) => patient.name?.[0]?.given?.[0]).sort()).toEqual([
      "Jane",
      "John",
    ]);
  });

  it("keeps meta.tag and honors _tag plus a bare-system _tag:not", async () => {
    const client = new MemoryFhirClient();
    const patient = await client.createResource({
      resourceType: "Patient",
      name: [{ family: "Contract" }],
    });
    const system = "https://lastehr.com/adapter-contract";
    const own = await client.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "own" },
      subject: { reference: `Patient/${patient.id}` },
      meta: { tag: [{ system, code: "own" }] },
    });
    const other = await client.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "other" },
      subject: { reference: `Patient/${patient.id}` },
      meta: { tag: [{ system, code: "other" }] },
    });
    await client.createResource({
      resourceType: "Observation",
      status: "final",
      code: { text: "plain" },
      subject: { reference: `Patient/${patient.id}` },
    });

    const tagged = await client.searchResources("Observation", {
      subject: `Patient/${patient.id}`,
      _tag: `${system}|own`,
    });
    expect(tagged.map((row) => row.id)).toEqual([own.id]);
    const persisted = tagged[0];
    expect(persisted?.meta?.tag).toEqual([{ system, code: "own" }]);

    const untagged = await client.searchResources("Observation", {
      subject: `Patient/${patient.id}`,
      "_tag:not": `${system}|`,
    });
    expect(untagged.map((row) => row.id)).not.toContain(own.id);
    expect(untagged.map((row) => row.id)).not.toContain(other.id);
    expect(untagged).toHaveLength(1);
  });

  it("limits _count without a next link and rejects _include", async () => {
    const client = new MemoryFhirClient();
    await client.createResource({ resourceType: "Patient", name: [{ family: "A" }] });
    await client.createResource({ resourceType: "Patient", name: [{ family: "B" }] });
    const bundle = await client.search("Patient", { _count: "1" });
    expect(bundle.total).toBe(2);
    expect(bundle.entry).toHaveLength(1);
    expect(bundle.link).toBeUndefined();
    await expect(client.search("Patient", { _include: "Patient:organization" })).rejects.toThrow(
      /does not implement _include/,
    );
  });

  it("filters observations by code and day-precision date", async () => {
    const client = await createSeededMemoryClient();
    const [maria] = await client.searchResources("Patient", { name: "Maria Garcia" });
    const heart = await client.searchResources("Observation", {
      patient: maria?.id ?? "",
      code: "8867-4",
      date: "ge2026-05-01",
    });
    expect(heart.map((row) => row.code?.text)).toEqual(["Heart rate"]);
    const early = await client.searchResources("Observation", {
      patient: maria?.id ?? "",
      code: "8867-4",
      date: "le2026-02-01",
    });
    expect(early).toEqual([]);
  });
});

describe("memory server wiring", () => {
  it("states that approved writes stay in this process", () => {
    expect(buildInstructions(true, "memory")).toContain(MEMORY_WRITE_NOTICE);
    expect(buildInstructions(true, "memory")).toContain("synthetic fixtures");
    expect(buildInstructions(true, "medplum")).not.toContain("FHIR_BACKEND=memory");
    expect(buildInstructions(false)).not.toContain("FHIR_BACKEND=memory");
  });

  it("loads with no credential and serves a seeded patient", async () => {
    const { server } = buildMcpServer({
      env: { FHIR_BACKEND: "memory" } as unknown as NodeJS.ProcessEnv,
    });
    const mcp = new Client({ name: "memory-unit", version: "0" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const result = await mcp.callTool({
        name: "search_patients",
        arguments: { name: "Maria Garcia" },
      });
      const text = JSON.stringify(result);
      expect(text).toContain("Garcia");
      expect(text).not.toContain("MEDPLUM_ACCESS_TOKEN");
      const instructions = mcp.getInstructions();
      expect(instructions).toContain(MEMORY_WRITE_NOTICE);
      expect(instructions).toContain("synthetic fixtures");
    } finally {
      await mcp.close();
    }
  });
});
