/**
 * Stdio adapter. It launches the configured MCP command and grades the
 * chart through the FHIR REST API, not through the server.
 *
 * If the server sends MCP elicitation, the harness answers it. A write that
 * lands with no prompt is left for the checks to record.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import type { BenchAdapter, BenchSession, ReviewContext } from "../adapter.js";
import { elicitationReply } from "../elicitation.js";
import { FhirRestStore } from "../fhir-rest.js";
import { asRecord, parseJson, sanitizeMessage } from "../json.js";
import type { Launch } from "../prepare.js";
import type { ServerConfig } from "../server-config.js";
import type {
  ElicitationRecord,
  ReviewDecision,
  StoreSnapshot,
  ToolDescriptor,
  ToolResult,
} from "../types.js";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function fingerprint(snapshot: StoreSnapshot): string {
  return [...snapshot.byReference.values()]
    .map((row) => `${row.reference}=${row.canonical}`)
    .sort()
    .join("\n");
}

class StdioSession implements BenchSession {
  private elicitation: ElicitationRecord | undefined;
  private reviewerError: string | undefined;
  private pendingBefore = "";
  private pendingName = "";
  private pendingArgs: Record<string, unknown> = {};

  constructor(
    private readonly store: FhirRestStore,
    private readonly mcp: Client,
    private readonly reviewer: (context: ReviewContext) => Promise<ReviewDecision>,
    registerElicitation: boolean,
  ) {
    if (!registerElicitation) return;
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
      const params = request.params as {
        requestedSchema?: { properties?: Record<string, { type?: string }> };
      };
      const reply = elicitationReply(params.requestedSchema?.properties ?? {}, decision);
      this.elicitation = {
        decision: reply.recorded,
        unchangedBeforeDecision,
        ...(reply.approvedCount !== undefined ? { approvedCount: reply.approvedCount } : {}),
      };
      return reply.response;
    });
  }

  async listTools(): Promise<ToolDescriptor[]> {
    const listed = await withTimeout(this.mcp.listTools(), 30_000, "MCP list tools");
    return listed.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
    }));
  }

  snapshot(): Promise<StoreSnapshot> {
    return this.store.snapshot();
  }

  mutate(reference: string): Promise<void> {
    return this.store.mutate(reference);
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
      const result = await withTimeout(
        this.mcp.callTool({ name, arguments: args }),
        60_000,
        `MCP tool ${name}`,
      );
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .map((item) => (asRecord(item) && item.type === "text" ? String(item.text ?? "") : ""))
        .filter(Boolean)
        .join("\n");
      const structured = asRecord((result as { structuredContent?: unknown }).structuredContent);
      return {
        name,
        args,
        isError: result.isError === true,
        text,
        json: parseJson(text) ?? structured,
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

export function createStdioAdapter(config: ServerConfig, launch: Launch): BenchAdapter {
  const store = new FhirRestStore(launch.fhirBaseUrl);
  return {
    id: config.id,
    writeToolNames: config.writeTools,
    readToolNames: config.readTools,
    contract: config.contract,
    ...(config.probe ? { probe: config.probe } : {}),
    server: {
      title: config.title,
      repository: config.repository,
      version: config.version,
      ...(config.commit ? { commit: config.commit } : {}),
    },
    reproduce: config.reproduce,
    async start(input): Promise<BenchSession> {
      if (config.reseed) await store.reseed();
      await store.plant(input.plants);
      const stderr: string[] = [];
      const transport = new StdioClientTransport({
        command: launch.command,
        args: launch.args,
        cwd: launch.cwd,
        env: launch.env,
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk: Buffer | string) => {
        stderr.push(String(chunk));
        const joined = stderr.join("");
        if (joined.length > 4000) stderr.splice(0, stderr.length, joined.slice(-2000));
      });
      const mcp = new Client(
        { name: "write-safety-bench", version: "0" },
        { capabilities: input.elicitation ? { elicitation: {} } : {} },
      );
      const session = new StdioSession(store, mcp, input.reviewer, input.elicitation);
      try {
        await withTimeout(mcp.connect(transport), 45_000, "MCP connect");
      } catch (error) {
        await mcp.close().catch(() => {});
        const tail = stderr.join("").replace(/\s+/g, " ").trim().slice(-180);
        const reason = error instanceof Error ? error.message : "MCP connect failed";
        throw new Error(tail ? `${reason}. ${tail}` : reason);
      }
      return session;
    },
  };
}
