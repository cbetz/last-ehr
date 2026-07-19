import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { createElicitationApproval } from "./approval.js";
import { HapiReadClient } from "./hapi.js";
import { createReadTools } from "./read-tools.js";
import { createMcpServer } from "./server.js";
import { createWriteTools, MCP_WRITE_TAG } from "./write-tools.js";

// Opt-in end-to-end proof of the write profile against the repository's
// seeded local HAPI stack: a real MCP client approves (and denies) an
// elicitation, and the FHIR server is queried directly for the outcome.
// CI's local-hapi job runs it; locally: npm run demo:local:prepare first.
const runHapiE2E = process.env.RUN_HAPI_E2E === "1";
const BASE_URL = process.env.FHIR_BASE_URL ?? "http://localhost:8080/fhir";

async function connect(approve: boolean) {
  const fhir = new HapiReadClient(BASE_URL);
  const server = createMcpServer(createReadTools(fhir), {
    writeTools: (liveServer) =>
      createWriteTools(fhir, createElicitationApproval(liveServer)),
  });
  const mcpClient = new Client(
    { name: "write-profile-e2e", version: "0" },
    { capabilities: { elicitation: {} } },
  );
  mcpClient.setRequestHandler(ElicitRequestSchema, async () => ({
    action: "accept" as const,
    content: { approve },
  }));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    mcpClient.connect(clientTransport),
  ]);
  return { mcpClient, fhir };
}

(runHapiE2E ? describe : describe.skip)("@lastehr/mcp write profile on HAPI", () => {
  it("commits an approved note to the real server, tagged, and denies save nothing", async () => {
    const probe = new HapiReadClient(BASE_URL);
    const patients = await probe.searchResources("Patient", {
      name: "Garcia",
      _count: "1",
    });
    const patientId = patients[0]?.id;
    expect(patientId).toBeTruthy();

    // Denied first: no write may exist afterward.
    const denied = await connect(false);
    const noteText = `MCP write-profile e2e ${Math.random().toString(36).slice(2)}`;
    const deniedResult = (await denied.mcpClient.callTool({
      name: "add_note",
      arguments: { patientId, text: noteText },
    })) as { content: Array<{ text: string }> };
    expect(JSON.parse(deniedResult.content[0].text)).toMatchObject({
      saved: false,
    });

    // Approved: the note lands on the server with the MCP write tag.
    const approved = await connect(true);
    const approvedResult = (await approved.mcpClient.callTool({
      name: "add_note",
      arguments: { patientId, text: noteText },
    })) as { content: Array<{ text: string }> };
    const payload = JSON.parse(approvedResult.content[0].text) as {
      saved: boolean;
      id: string;
    };
    expect(payload.saved).toBe(true);

    const persisted = await probe.searchResources("Communication", {
      _id: payload.id,
      _count: "2",
    });
    expect(persisted).toHaveLength(1);
    expect(
      persisted[0].meta?.tag?.some(
        (tag) =>
          tag.system === MCP_WRITE_TAG.system &&
          tag.code === MCP_WRITE_TAG.code,
      ),
    ).toBe(true);
    // Exactly one copy: the denied attempt never landed.
    const byText = await probe.searchResources("Communication", {
      subject: `Patient/${patientId}`,
      _count: "100",
    });
    const matching = byText.filter((c) =>
      c.payload?.some((p) => p.contentString === noteText),
    );
    expect(matching).toHaveLength(1);

    // Cleanup via direct REST delete (the MCP surface has no delete).
    const res = await fetch(`${BASE_URL}/Communication/${payload.id}`, {
      method: "DELETE",
    });
    expect(res.ok).toBe(true);
  }, 30_000);
});
