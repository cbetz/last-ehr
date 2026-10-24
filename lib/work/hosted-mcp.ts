import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InitializeRequestSchema, JSONRPCMessageSchema, isInitializeRequest, isJSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { WorkConnectorError } from "./connector-client";
import { workContextSchema, type WorkAssistantContext } from "./context";
import { createWorkMcpServer } from "./mcp";
import { WorkError, type DurableWorkService, type WorkActor } from "./service";

export type HostedWorkAssistantIdentity = { actor: WorkActor; principal: string; expiresAt: number };
export type HostedWorkMcpLimits = {
  maxSessions: number;
  maxSessionsPerPrincipal: number;
  idleTimeoutMs: number;
  maxSessionLifetimeMs: number;
  maxBodyBytes: number;
  bodyTimeoutMs: number;
  authTimeoutMs: number;
};
export type HostedWorkMcpHandler = {
  listener(req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): Promise<void>;
  sessionCount(): number;
  paths: { mcp: string; metadata: string };
};
export type HostedWorkMcpOptions = {
  publicUrl: string;
  issuer: string;
  service: DurableWorkService;
  readContext: () => Promise<WorkAssistantContext>;
  verifyAssistant: (authorization?: string) => Promise<HostedWorkAssistantIdentity>;
  now?: () => number;
  limits?: Partial<HostedWorkMcpLimits>;
};

const defaults: HostedWorkMcpLimits = { maxSessions: 64, maxSessionsPerPrincipal: 4, idleTimeoutMs: 15 * 60_000, maxSessionLifetimeMs: 60 * 60_000, maxBodyBytes: 16 * 1024, bodyTimeoutMs: 10_000, authTimeoutMs: 10_000 };
const maxMessageElements = 256;
const maxMessageDepth = 16;
const sessionNotFound = '{"jsonrpc":"2.0","error":{"code":-32001,"message":"Session not found"},"id":null}';
const identityPart = /^[A-Za-z0-9._:@/-]{1,160}$/;
const safeText = z.string().trim().min(1).max(2000).refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
const proposalSchema = z.object({
  description: safeText,
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value).optional(),
  sourceReference: z.string().regex(/^Observation\/[A-Za-z0-9.-]{1,64}$/),
  sourceVersionId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
}).strict();

type Session = {
  id?: string;
  principal: string;
  actor: WorkActor;
  expiresAt: number;
  lastSeenAt: number;
  server: Server;
  transport: StreamableHTTPServerTransport;
  timer?: ReturnType<typeof setTimeout>;
  closing?: Promise<void>;
};

function configuredUrl(value: string, mcp = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Hosted Work MCP configuration is invalid."); }
  const localTest = process.env.NODE_ENV === "test" && url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!localTest && url.protocol !== "https:") || url.username || url.password || url.search || url.hash ||
    value.length > 2048 || (mcp && url.pathname !== "/mcp")) throw new Error("Hosted Work MCP configuration is invalid.");
  return url;
}

function stripCredentials(req: IncomingMessage): void {
  const raw: string[] = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (!["authorization", "proxy-authorization", "cookie"].includes(req.rawHeaders[index].toLowerCase())) raw.push(req.rawHeaders[index], req.rawHeaders[index + 1]);
  }
  req.rawHeaders = raw;
  delete req.headers.authorization;
  delete req.headers["proxy-authorization"];
  delete req.headers.cookie;
  // A caller's middleware must not accidentally forward a bearer-bearing
  // AuthInfo object to the SDK. The tools close over a bounded actor instead.
  delete (req as IncomingMessage & { auth?: unknown }).auth;
}

function bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error("Operation timed out.")), milliseconds);
    promise.then((value) => { clearTimeout(timer); accept(value); }, () => { clearTimeout(timer); reject(new Error("Operation failed.")); });
  });
}

/** Bound validation work before any SDK/Zod schema traverses caller data. */
function boundedMessage(value: unknown): boolean {
  const stack = [{ value, depth: 0 }];
  let elements = 0;
  while (stack.length) {
    const node = stack.pop()!;
    if (node.value === null || typeof node.value !== "object") continue;
    if (node.depth > maxMessageDepth) return false;
    for (const key in node.value) {
      if (!Object.prototype.hasOwnProperty.call(node.value, key)) continue;
      if (++elements > maxMessageElements) return false;
      const child: unknown = (node.value as Record<string, unknown>)[key];
      if (child !== null && typeof child === "object") stack.push({ value: child, depth: node.depth + 1 });
    }
  }
  return true;
}

function readBody(req: IncomingMessage, limits: HostedWorkMcpLimits): Promise<{ status: number; body?: unknown }> {
  const declared = req.headers["content-length"];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > limits.maxBodyBytes)) return Promise.resolve({ status: 413 });
  return new Promise((accept) => {
    let size = 0;
    const chunks: Buffer[] = [];
    const finish = (status: number, body?: unknown) => {
      clearTimeout(timer);
      req.off("data", onData); req.off("end", onEnd); req.off("error", onError); req.off("aborted", onError);
      accept({ status, body });
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > limits.maxBodyBytes) { finish(413); req.resume(); return; }
      chunks.push(bytes);
    };
    const onEnd = () => {
      try {
        const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        if (Array.isArray(body)) { finish(400); return; }
        if (!boundedMessage(body)) { finish(413); return; }
        if (!JSONRPCMessageSchema.safeParse(body).success) { finish(400); return; }
        finish(200, body);
      } catch { finish(400); }
    };
    const onError = () => finish(400);
    const timer = setTimeout(() => { finish(408); req.resume(); }, limits.bodyTimeoutMs);
    req.on("data", onData); req.once("end", onEnd); req.once("error", onError); req.once("aborted", onError);
  });
}

function directConnector(options: HostedWorkMcpOptions, actor: WorkActor, ensureActive: () => void) {
  let context: WorkAssistantContext | undefined;
  const read = async () => {
    ensureActive();
    const parsed = workContextSchema.safeParse(await options.readContext());
    ensureActive();
    if (!parsed.success) throw new WorkConnectorError("invalid_response");
    return structuredClone(parsed.data);
  };
  const mapped = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { ensureActive(); return await operation(); }
    catch (error) {
      if (error instanceof WorkConnectorError) throw error;
      if (error instanceof WorkError) throw new WorkConnectorError(error.code);
      throw new WorkConnectorError("request_failed");
    }
  };
  return {
    readContext: () => mapped(async () => { context = undefined; context = await read(); return structuredClone(context); }),
    propose: (input: unknown) => mapped(async () => {
      const parsed = proposalSchema.safeParse(input);
      if (!parsed.success) throw new WorkConnectorError("invalid_input");
      if (!context) throw new WorkConnectorError("context_required");
      const value = parsed.data;
      if (value.sourceReference !== context.observation.reference || value.sourceVersionId !== context.observation.versionId) throw new WorkConnectorError("source_mismatch");
      const previous = context;
      context = undefined;
      const current = await read();
      if (current.patient.reference !== previous.patient.reference || current.observation.reference !== previous.observation.reference || current.observation.versionId !== previous.observation.versionId) throw new WorkConnectorError("source_mismatch");
      context = current;
      ensureActive();
      return options.service.submit(actor, { patientId: current.patient.reference.slice("Patient/".length), source: { reference: value.sourceReference, versionId: value.sourceVersionId }, description: value.description, ...(value.dueDate ? { dueDate: value.dueDate } : {}) }, value.idempotencyKey);
    }),
    get: (id: string) => mapped(() => options.service.get(actor, id)),
    cancel: (id: string) => mapped(() => options.service.cancel(actor, id)),
  };
}

/** Stateful, assistant-only HTTP MCP. Review and persistence remain in Last. */
export function createHostedWorkMcpHandler(options: HostedWorkMcpOptions): HostedWorkMcpHandler {
  const publicUrl = configuredUrl(options.publicUrl, true);
  configuredUrl(options.issuer);
  const now = options.now ?? Date.now;
  const limits = { ...defaults, ...options.limits, maxSessionsPerPrincipal: options.limits?.maxSessionsPerPrincipal ?? Math.min(defaults.maxSessionsPerPrincipal, options.limits?.maxSessions ?? defaults.maxSessions) };
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1) || limits.maxBodyBytes > 16 * 1024 || limits.maxSessions > 10_000 || limits.maxSessionsPerPrincipal > limits.maxSessions || limits.maxSessionLifetimeMs > 24 * 60 * 60_000 || limits.idleTimeoutMs > limits.maxSessionLifetimeMs || limits.authTimeoutMs > 30_000 || limits.bodyTimeoutMs > 30_000) throw new Error("Hosted Work MCP limits are invalid.");
  const paths = { mcp: "/mcp", metadata: "/.well-known/oauth-protected-resource/mcp" };
  const metadataUrl = new URL(paths.metadata, publicUrl.origin).href;
  const metadata = JSON.stringify({ resource: publicUrl.href, authorization_servers: [options.issuer], scopes_supported: ["work:assistant"], bearer_methods_supported: ["header"], resource_documentation: "https://www.lastehr.com/docs/hosted-work" });
  const sessions = new Map<string, Session>();
  // Reservations enter this set before the first await during initialization.
  // Pending initialization counts against both hard capacity limits.
  const active = new Set<Session>();
  let closed = false;
  const detach = (session: Session) => {
    active.delete(session);
    if (session.id) sessions.delete(session.id);
    if (session.timer) clearTimeout(session.timer);
  };
  const closeSession = (session: Session): Promise<void> => {
    if (session.closing) return session.closing;
    detach(session);
    session.closing = session.server.close().catch(() => undefined);
    return session.closing;
  };
  const stale = (session: Session) => closed || !active.has(session) || now() >= session.expiresAt || now() - session.lastSeenAt >= limits.idleTimeoutMs;
  const schedule = (session: Session) => {
    if (session.timer) clearTimeout(session.timer);
    const delay = Math.max(1, Math.min(session.expiresAt, session.lastSeenAt + limits.idleTimeoutMs) - now());
    session.timer = setTimeout(() => { void closeSession(session); }, delay);
    session.timer.unref();
  };
  const sweep = async () => { await Promise.all([...active].filter(stale).map(closeSession)); };
  const respond = (res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) => {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
    res.end(body);
  };
  const rpcError = (res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}) => respond(res, status, JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), headers);
  const unauthorized = (res: ServerResponse) => respond(res, 401, '{"error":"invalid_token","error_description":"A valid assistant token is required."}', { "www-authenticate": `Bearer error="invalid_token", scope="work:assistant", resource_metadata="${metadataUrl}"` });

  async function listener(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let created: Session | undefined;
    try {
      const url = new URL(req.url ?? "/", publicUrl.origin);
      if (url.search || url.hash || !req.url?.startsWith("/") || url.origin !== publicUrl.origin) { rpcError(res, 400, "Invalid request URL."); return; }
      if (req.headers.origin !== undefined && req.headers.origin !== publicUrl.origin) { rpcError(res, 403, "Origin is not allowed."); return; }
      if (url.pathname === paths.metadata) {
        if (req.method !== "GET") { rpcError(res, 405, "Method not allowed.", { allow: "GET" }); return; }
        respond(res, 200, metadata); return;
      }
      if (url.pathname !== paths.mcp) { respond(res, 404, '{"error":"not_found"}'); return; }
      if (closed) { rpcError(res, 503, "The service is shutting down."); return; }
      const authorization = req.headers.authorization;
      const authorizationCount = req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === "authorization").length;
      stripCredentials(req);
      let verified: HostedWorkAssistantIdentity;
      try {
        if (authorizationCount > 1) throw new Error("Invalid credentials.");
        verified = await bounded(options.verifyAssistant(authorization), limits.authTimeoutMs);
        if (!verified || verified.actor?.role !== "assistant" || !identityPart.test(verified.actor.tenantId) || !identityPart.test(verified.actor.subject) || typeof verified.principal !== "string" || verified.principal.length < 1 || verified.principal.length > 512 || !Number.isFinite(verified.expiresAt) || verified.expiresAt <= now()) throw new Error("Invalid identity.");
      } catch { unauthorized(res); return; }
      if (closed) { rpcError(res, 503, "The service is shutting down."); return; }
      if (!["POST", "GET", "DELETE"].includes(req.method ?? "")) { rpcError(res, 405, "Method not allowed.", { allow: "GET, POST, DELETE" }); return; }
      const principal = createHash("sha256").update(verified.principal).digest("hex");
      const actor: WorkActor = { tenantId: verified.actor.tenantId, subject: verified.actor.subject, role: "assistant" };
      let body: unknown;
      if (req.method === "POST") {
        if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") { rpcError(res, 415, "Use application/json."); return; }
        const read = await readBody(req, limits);
        if (read.status !== 200) { rpcError(res, read.status, read.status === 413 ? "Request body too large." : "Invalid request body.", read.status === 413 || read.status === 408 ? { connection: "close" } : {}); return; }
        body = read.body;
      } else if ((req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0") || req.headers["transfer-encoding"] !== undefined) { rpcError(res, 400, "This method has no request body."); return; }
      if (verified.expiresAt <= now()) { unauthorized(res); return; }
      if (closed) { rpcError(res, 503, "The service is shutting down."); return; }
      await sweep();
      if (closed) { rpcError(res, 503, "The service is shutting down."); return; }
      const sessionId = req.headers["mcp-session-id"];
      let session: Session;
      if (sessionId !== undefined) {
        const found = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
        if (!found || found.principal !== principal || found.actor.tenantId !== actor.tenantId || found.actor.subject !== actor.subject || stale(found)) { respond(res, 404, sessionNotFound); return; }
        session = found;
        session.expiresAt = Math.min(session.expiresAt, verified.expiresAt);
        session.lastSeenAt = now();
        schedule(session);
      } else {
        if (req.method !== "POST" || !isJSONRPCRequest(body) || !isInitializeRequest(body) || !InitializeRequestSchema.safeParse(body).success) { rpcError(res, 400, "A session initialization request is required."); return; }
        if (active.size >= limits.maxSessions || [...active].filter((item) => item.principal === principal).length >= limits.maxSessionsPerPrincipal) { rpcError(res, 503, "Session capacity is unavailable.", { "retry-after": "30" }); return; }
        const server = createWorkMcpServer({ client: directConnector(options, actor, () => { if (!pending || stale(pending)) throw new WorkConnectorError("unauthorized"); }) });
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID, enableJsonResponse: true,
          onsessioninitialized: (id) => {
            if (stale(pending)) throw new Error("The session expired.");
            pending.id = id; sessions.set(id, pending);
          },
          onsessionclosed: () => detach(pending),
        });
        const pending: Session = { principal, actor, expiresAt: Math.min(verified.expiresAt, now() + limits.maxSessionLifetimeMs), lastSeenAt: now(), server, transport };
        session = pending; created = pending;
        active.add(pending); schedule(pending);
        server.onclose = () => detach(pending);
        server.onerror = () => { /* Do not log or forward bearer/backend diagnostics. */ };
        await server.connect(transport);
      }
      if (stale(session)) { await closeSession(session); respond(res, 404, sessionNotFound); return; }
      await session.transport.handleRequest(req, res, body);
      if (created && (!created.id || res.statusCode >= 400)) await closeSession(created);
    } catch {
      if (created) await closeSession(created);
      rpcError(res, 500, "The MCP request could not be completed.");
    }
  }
  return { paths, listener, sessionCount: () => active.size, close: async () => { closed = true; await Promise.all([...active].map(closeSession)); } };
}
