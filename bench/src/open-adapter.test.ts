import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import type { BenchAdapter } from "./adapter.js";
import { createStdioAdapter } from "./adapters/stdio-mcp.js";
import { applicability } from "./applicability.js";
import { defaultContract } from "./contract.js";
import { runProbe } from "./probe.js";
import { runBench } from "./runner.js";
import { SCENARIOS } from "./scenarios.js";
import type { ServerConfig } from "./server-config.js";

const maria = { name: "Maria Garcia", birthDate: "2001-07-30" };

function bundle(resources: Record<string, unknown>[]) {
  return {
    resourceType: "Bundle",
    type: "searchset",
    entry: resources.map((resource) => ({ resource })),
  };
}

async function fakeFhir(): Promise<{ url: string; close: () => Promise<void> }> {
  const notes: Record<string, unknown>[] = [];
  const patient = {
    resourceType: "Patient",
    id: "maria",
    birthDate: maria.birthDate,
    name: [{ family: "Garcia", given: ["Maria"] }],
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      const payload = JSON.stringify(body);
      response.writeHead(status, { "content-type": "application/fhir+json" });
      response.end(payload);
    };
    if (request.method === "POST" && url.pathname.endsWith("/Communication")) {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const resource = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        resource.id = `note-${notes.length + 1}`;
        notes.push(resource);
        send(201, resource);
      });
      return;
    }
    if (url.pathname.endsWith("/Patient") || url.pathname.endsWith("/Patient/maria")) {
      send(200, url.pathname.endsWith("/Patient/maria") ? patient : bundle([patient]));
      return;
    }
    if (url.pathname.endsWith("/Communication")) {
      send(200, bundle(notes));
      return;
    }
    send(200, bundle([]));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/fhir`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function config(url: string, mode: string): { config: ServerConfig; env: Record<string, string> } {
  return {
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      FHIR_BASE_URL: url,
      FIXTURE_MODE: mode,
    },
    config: {
      id: `fixture-${mode}`,
      title: "Fixture",
      repository: "https://example.invalid/fixture",
      version: "0",
      command: process.execPath,
      args: ["--import", "tsx", "bench/src/test-support/stdio-fixture.ts"],
      env: {},
      cwd: "repo",
      fhirBaseUrl: url,
      writeTools: mode === "read-only" ? [] : ["create_note"],
      readTools: ["search_patients"],
      contract: {
        scripted: false,
        hidesWritesWithoutElicitation: false,
        citationArgs: [],
        approval: mode === "elicit" ? "mcp-elicitation" : "none",
      },
      reseed: false,
      ...(mode === "read-only"
        ? {}
        : { probe: { tool: "create_note", arguments: { patientId: "$patientId", text: "Bench probe note." } } }),
      configFiles: {},
      reproduce: ["node --import tsx bench/src/test-support/stdio-fixture.ts"],
    },
  };
}

async function probeMode(mode: string) {
  const fhir = await fakeFhir();
  try {
    const built = config(fhir.url, mode);
    const adapter = createStdioAdapter(built.config, {
      command: process.execPath,
      args: built.config.args,
      env: built.env,
      cwd: process.cwd(),
      fhirBaseUrl: fhir.url,
    });
    return await runProbe(adapter);
  } finally {
    await fhir.close();
  }
}

describe("scenario applicability", () => {
  const note = SCENARIOS.find((scenario) => scenario.id === "note-approved");
  const hidden = SCENARIOS.find((scenario) => scenario.id === "writes-hidden-without-elicitation");
  const stale = SCENARIOS.find((scenario) => scenario.id === "stale-cited-note");
  if (!note || !hidden || !stale) throw new Error("missing scenario");

  it("marks a scripted run on another server n/a", () => {
    const decision = applicability({
      scenario: note,
      agent: "scripted",
      contract: { ...defaultContract(), scripted: false },
      writeTools: ["create"],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("Last EHR tool names");
  });

  it("marks write scenarios n/a when the server has no write tools", () => {
    const decision = applicability({
      scenario: note,
      agent: "model",
      contract: { ...defaultContract(), scripted: false },
      writeTools: [],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("no write tools");
  });

  it("does not apply the elicitation-hidden check to a server that lists its writes", () => {
    const decision = applicability({
      scenario: hidden,
      agent: "model",
      contract: { ...defaultContract(), scripted: false, hidesWritesWithoutElicitation: false },
      writeTools: ["create"],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("elicitation");
  });

  it("does not apply stale-evidence when the server does not pause for approval", () => {
    const decision = applicability({
      scenario: stale,
      agent: "model",
      contract: { ...defaultContract(), scripted: false, approval: "none" },
      writeTools: ["create"],
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toContain("elicitation");
  });

  it("does not start a server when every scenario is n/a", async () => {
    let started = 0;
    const adapter: BenchAdapter = {
      id: "example-readonly",
      writeToolNames: [],
      contract: {
        scripted: false,
        hidesWritesWithoutElicitation: false,
        citationArgs: [],
        approval: "none",
      },
      async start() {
        started += 1;
        throw new Error("started");
      },
    };
    const report = await runBench({ adapter, agent: "scripted" });
    expect(started).toBe(0);
    expect(report.summary).toEqual({ pass: 0, fail: 0, na: SCENARIOS.length, total: SCENARIOS.length });
    expect(report.scenarios.every((scenario) => scenario.status === "n/a")).toBe(true);
  });
});

describe("stdio MCP adapter", () => {
  it(
    "records a declined elicitation as an approval-gate pass",
    async () => {
      const report = await probeMode("elicit");
      const approval = report.scenarios.find((scenario) => scenario.id === "probe-approval-gate");
      expect(approval?.status, JSON.stringify(approval, null, 2)).toBe("pass");
      expect(report.summary.fail).toBe(0);
    },
    30_000,
  );

  it(
    "records a write with no prompt as an approval-gate fail",
    async () => {
      const report = await probeMode("direct");
      const approval = report.scenarios.find((scenario) => scenario.id === "probe-approval-gate");
      expect(approval?.status, JSON.stringify(approval, null, 2)).toBe("fail");
      expect(approval?.checks[0]?.detail).toContain("did not send an MCP elicitation");
    },
    30_000,
  );

  it(
    "records a server with no write tools as n/a",
    async () => {
      const report = await probeMode("read-only");
      const approval = report.scenarios.find((scenario) => scenario.id === "probe-approval-gate");
      expect(approval?.status, JSON.stringify(approval, null, 2)).toBe("n/a");
      expect(approval?.reason).toContain("no write tools");
      expect(report.summary.fail).toBe(0);
    },
    30_000,
  );
});
