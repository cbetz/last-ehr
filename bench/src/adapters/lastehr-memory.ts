import type { Resource, ResourceType } from "@medplum/fhirtypes";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import type { BenchAdapter, BenchSession, ReviewContext } from "../adapter.js";
import { asRecord, canonicalJson, parseJson, sanitizeMessage } from "../json.js";
import type {
  ElicitationRecord,
  Plant,
  ReviewDecision,
  StoredResource,
  StoreSnapshot,
  ToolDescriptor,
  ToolResult,
} from "../types.js";
import { createSeededMemoryClient } from "../../../packages/mcp/src/memory-seed.js";
import { MemoryFhirClient } from "../../../packages/mcp/src/memory.js";
import { buildMcpServer } from "../../../packages/mcp/src/server.js";
import { WRITE_TOOL_NAMES } from "../../../packages/mcp/src/write-tools.js";

/**
 * Reference adapter: `@lastehr/mcp` in-process, `FHIR_BACKEND=memory`,
 * writes in proposal mode. The synthetic fixture charts are the only
 * patients. Nothing is sent to a FHIR server.
 *
 * The snapshot covers the chart types the scenarios check. It is not an
 * exhaustive dump of every possible resource type.
 */

const SNAPSHOT_TYPES = [
  "Patient",
  "Observation",
  "Communication",
  "Task",
  "AllergyIntolerance",
  "Condition",
  "MedicationRequest",
  "DocumentReference",
  "Immunization",
  "Provenance",
  "Encounter",
  "CarePlan",
  "Goal",
] as const satisfies readonly ResourceType[];

const PLANTED_TAG = {
  system: "https://lastehr.com/write-safety-bench",
  code: "planted",
} as const;

function fingerprint(snapshot: StoreSnapshot): string {
  return [...snapshot.byReference.values()]
    .map((row) => `${row.reference}=${row.canonical}`)
    .sort()
    .join("\n");
}

function bump(resource: Record<string, unknown>): void {
  const quantity = asRecord(resource.valueQuantity);
  if (quantity && typeof quantity.value === "number") {
    quantity.value += 1;
    return;
  }
  const payload = Array.isArray(resource.payload) ? resource.payload : [];
  const first = asRecord(payload[0]);
  if (first && typeof first.contentString === "string") {
    first.contentString = `${first.contentString}\n[stale]`;
    return;
  }
  if (typeof resource.description === "string") {
    resource.description = `${resource.description}\n[stale]`;
    return;
  }
  const meta = asRecord(resource.meta) ?? {};
  const tag = Array.isArray(meta.tag) ? [...meta.tag] : [];
  tag.push({ system: PLANTED_TAG.system, code: "stale" });
  resource.meta = { ...meta, tag };
}

class LastehrMemorySession implements BenchSession {
  private elicitation: ElicitationRecord | undefined;
  private reviewerError: string | undefined;
  /** Fingerprint taken at the start of the in-flight tools/call, before the prompt. */
  private pendingBefore = "";
  private pendingName = "";
  private pendingArgs: Record<string, unknown> = {};

  constructor(
    private readonly fhir: MemoryFhirClient,
    private readonly mcp: Client,
    private readonly reviewer: (context: ReviewContext) => Promise<ReviewDecision>,
    registerElicitation: boolean,
  ) {
    if (!registerElicitation) return;
    // The approval prompt does not carry the tool arguments in a stable
    // shape. They are the ones recorded around the in-flight callTool.
    // A client that did not declare elicitation must not register this
    // handler: the SDK rejects it at connect time.
    this.mcp.setRequestHandler(ElicitRequestSchema, async (request) => {
      const opened = fingerprint(await this.snapshot());
      const unchangedBeforeDecision = opened === this.pendingBefore && this.pendingBefore.length > 0;
      let decision: ReviewDecision = "decline";
      try {
        decision = await this.reviewer({
          message: request.params.message,
          toolName: this.pendingName,
          args: this.pendingArgs,
        });
      } catch (error) {
        this.reviewerError = sanitizeMessage(error);
        decision = "decline";
      }
      this.elicitation = { decision, unchangedBeforeDecision };
      if (decision === "approve") return { action: "accept" as const, content: { approve: true } };
      if (decision === "cancel") return { action: "cancel" as const };
      return { action: "decline" as const };
    });
  }

  async listTools(): Promise<ToolDescriptor[]> {
    const listed = await this.mcp.listTools();
    return listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
    }));
  }

  async snapshot(): Promise<StoreSnapshot> {
    const byReference = new Map<string, StoredResource>();
    for (const resourceType of SNAPSHOT_TYPES) {
      const rows = await this.fhir.searchResources(resourceType, {});
      for (const row of rows) {
        if (!row.id) continue;
        const resource = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
        const reference = `${resourceType}/${row.id}`;
        byReference.set(reference, {
          reference,
          resourceType,
          id: row.id,
          canonical: canonicalJson(resource),
          resource,
        });
      }
    }
    return { byReference };
  }

  async mutate(reference: string): Promise<void> {
    const slash = reference.indexOf("/");
    if (slash <= 0) throw new Error("bench mutate reference is not ResourceType/id");
    const resourceType = reference.slice(0, slash) as ResourceType;
    const id = reference.slice(slash + 1);
    const current = await this.fhir.readResource(resourceType, id);
    const next = JSON.parse(JSON.stringify(current)) as Record<string, unknown>;
    bump(next);
    await this.fhir.deleteResource(resourceType, id);
    await this.fhir.createResource(next as unknown as Resource);
  }

  takeReviewerError(): string | undefined {
    return this.reviewerError;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    this.pendingName = name;
    this.pendingArgs = args;
    this.pendingBefore = fingerprint(await this.snapshot());
    this.elicitation = undefined;
    try {
      const result = await this.mcp.callTool({ name, arguments: args });
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .map((item) => (asRecord(item) && item.type === "text" ? String(item.text ?? "") : ""))
        .filter(Boolean)
        .join("\n");
      return {
        name,
        args,
        isError: result.isError === true,
        text,
        json: parseJson(text),
        ...(this.elicitation ? { elicitation: this.elicitation } : {}),
      };
    } finally {
      this.pendingBefore = "";
      this.pendingName = "";
      this.pendingArgs = {};
    }
  }

  async close(): Promise<void> {
    await this.mcp.close();
  }
}

async function plantAll(fhir: MemoryFhirClient, plants: readonly Plant[]): Promise<void> {
  for (const plant of plants) {
    const rows = await fhir.searchResources("Patient", { name: plant.patient.name });
    const matches = rows.filter((row) => row.birthDate === plant.patient.birthDate && row.id);
    if (matches.length !== 1 || !matches[0]?.id) {
      throw new Error("bench plant did not match exactly one patient");
    }
    const patientId = matches[0].id;
    if (plant.kind === "note") {
      await fhir.createResource({
        resourceType: "Communication",
        status: "completed",
        subject: { reference: `Patient/${patientId}` },
        sent: "2026-04-01T00:00:00.000Z",
        payload: [{ contentString: plant.text }],
        meta: { tag: [PLANTED_TAG] },
      });
      continue;
    }
    const body = Buffer.from(plant.body, "utf8");
    await fhir.createResource({
      resourceType: "DocumentReference",
      status: "current",
      description: plant.title,
      type: { text: plant.title },
      subject: { reference: `Patient/${patientId}` },
      date: "2026-04-01T00:00:00Z",
      content: [
        {
          attachment: {
            contentType: "text/plain",
            title: plant.title,
            data: body.toString("base64"),
            size: body.byteLength,
          },
        },
      ],
      meta: { tag: [PLANTED_TAG] },
    });
  }
}

export function createLastehrMemoryAdapter(): BenchAdapter {
  return {
    id: "lastehr-memory",
    writeToolNames: WRITE_TOOL_NAMES,
    async start(input): Promise<BenchSession> {
      const fhir = await createSeededMemoryClient();
      await plantAll(fhir, input.plants);
      const { server } = buildMcpServer({
        env: {
          FHIR_BACKEND: "memory",
          LASTEHR_MCP_WRITES: "proposal",
        } as unknown as NodeJS.ProcessEnv,
        client: fhir,
      });
      const mcp = new Client(
        { name: "write-safety-bench", version: "0" },
        { capabilities: input.elicitation ? { elicitation: {} } : {} },
      );
      const session = new LastehrMemorySession(fhir, mcp, input.reviewer, input.elicitation);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
      return session;
    },
  };
}
