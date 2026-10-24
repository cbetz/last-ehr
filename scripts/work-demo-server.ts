import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";

import type { DurableWorkService, WorkActor } from "../lib/work/service";
import type { AssistantWorkRuntime } from "../lib/work/assistant";
import { workDemoCss, workDemoPage, workDemoScript } from "./work-demo-page";

export const LAB_TENANT = "synthetic-work-lab";
export const LAB_ASSISTANT: WorkActor = { tenantId: LAB_TENANT, subject: "assistant-lab", role: "assistant" };
export const LAB_REVIEWER: WorkActor = { tenantId: LAB_TENANT, subject: "reviewer-lab", role: "reviewer" };

export type WorkLabFixture = {
  patientId: string;
  source: { reference: string; versionId: string };
  patientLabel: string;
  resultLabel: string;
};

function equalSecret(left: string, right: string): boolean {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}

export function validateLabKeys(assistantKey: string, reviewerKey: string): void {
  if (assistantKey.length < 32 || reviewerKey.length < 32 || equalSecret(assistantKey, reviewerKey)) {
    throw new Error("Use distinct assistant and reviewer lab keys, each at least 32 characters.");
  }
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") {
    throw new HttpError(415, "json_required", "Send an application/json request.");
  }
  let size = 0;
  const parts: Buffer[] = [];
  for await (const part of req) {
    const chunk = Buffer.from(part);
    size += chunk.length;
    if (size > 12_000) throw new HttpError(413, "body_too_large", "The request exceeds the lab’s size limit.");
    parts.push(chunk);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw new HttpError(400, "invalid_json", "Send a valid JSON object."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_json", "Send a valid JSON object.");
  return body as Record<string, unknown>;
}

export function createWorkLabServer(options: {
  service: DurableWorkService;
  fixture: WorkLabFixture;
  assistantKey: string;
  reviewerKey: string;
  assistant?: AssistantWorkRuntime;
  modelLabel?: string;
}) {
  validateLabKeys(options.assistantKey, options.reviewerKey);
  // Fixed lab identity only. A real deployment needs an authenticated identity
  // and authorization adapter; possession of these keys proves no clinical role.
  const cookieSignature = (expires: string) => createHmac("sha256", options.reviewerKey).update(`last-work-lab-reviewer-v1:${expires}`).digest("base64url");
  let failedLogins = 0;
  let loginWindow = Date.now();
  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 3300;
    const origin = `http://127.0.0.1:${port}`;
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(value));
    };
    const requireAssistant = () => {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token || !equalSecret(token, options.assistantKey)) throw new HttpError(401, "assistant_auth_required", "Use the assistant API key for this endpoint.");
    };
    const requireReviewer = () => {
      const token = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("last_work_reviewer="))?.slice("last_work_reviewer=".length);
      const [expires, signature] = token?.split(".") ?? [];
      if (!expires || !/^\d{13}$/.test(expires) || Number(expires) <= Date.now() || Number(expires) > Date.now() + 3_600_000 || !signature || !equalSecret(signature, cookieSignature(expires))) throw new HttpError(401, "reviewer_auth_required", "Sign in with the separate reviewer key.");
      if (req.method !== "GET" && req.headers.origin !== origin) throw new HttpError(403, "origin_required", "Use the local reviewer page to make this decision.");
    };
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) throw new HttpError(400, "invalid_host", "Open this lab using its numeric loopback URL.");
      if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, "invalid_origin", "Cross-origin requests are not allowed.");
      const url = new URL(req.url || "/", origin);
      if (url.search) throw new HttpError(400, "query_not_supported", "This endpoint does not accept query parameters.");
      const path = url.pathname;
      if (req.method === "GET" && path === "/health") return send(200, { status: "ready", mode: "synthetic-only" });
      if (req.method === "GET" && ["/", "/assistant", "/styles.css", "/app.js"].includes(path)) {
        const isCss = path === "/styles.css";
        const isScript = path === "/app.js";
        res.writeHead(200, { "content-type": isCss ? "text/css; charset=utf-8" : isScript ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8" });
        return res.end(isCss ? workDemoCss : isScript ? workDemoScript : workDemoPage(path === "/assistant" ? "assistant" : "reviewer"));
      }
      if (path === "/api/reviewer/session" && req.method === "POST") {
        if (req.headers.origin !== origin) throw new HttpError(403, "origin_required", "Sign in from the local reviewer page.");
        if (Date.now() - loginWindow > 60_000) { failedLogins = 0; loginWindow = Date.now(); }
        if (failedLogins >= 10) throw new HttpError(429, "login_limited", "Wait one minute before trying another reviewer key.");
        const body = await jsonBody(req);
        if (Object.keys(body).length !== 1 || typeof body.key !== "string" || !equalSecret(body.key, options.reviewerKey)) {
          failedLogins++;
          throw new HttpError(401, "reviewer_auth_required", "The reviewer key was not accepted.");
        }
        failedLogins = 0;
        const expires = String(Date.now() + 3_600_000);
        res.setHeader("set-cookie", `last_work_reviewer=${expires}.${cookieSignature(expires)}; HttpOnly; SameSite=Strict; Path=/api/reviewer; Max-Age=3600`);
        return send(200, { signedIn: true, mode: "synthetic-only" });
      }
      if (path === "/api/reviewer/session" && req.method === "DELETE") {
        requireReviewer();
        res.setHeader("set-cookie", "last_work_reviewer=; HttpOnly; SameSite=Strict; Path=/api/reviewer; Max-Age=0");
        return send(200, { signedIn: false });
      }
      if (path === "/api/fixture" && req.method === "GET") {
        requireAssistant();
        return send(200, { fixture: options.fixture, assistant: { enabled: Boolean(options.assistant), modelLabel: options.modelLabel ?? "Manual API client — no model" } });
      }
      if (path === "/api/assistant/runs") {
        requireAssistant();
        if (!options.assistant) throw new HttpError(503, "agent_disabled", "Start the lab with --agent to enable a real assistant.");
        if (req.method === "GET") return send(200, { runs: await options.assistant.list() });
        if (req.method === "POST") {
          const body = await jsonBody(req);
          if (Object.keys(body).length !== 1 || !("prompt" in body)) throw new HttpError(400, "invalid_input", "Send only a synthetic work request in prompt.");
          return send(202, { run: await options.assistant.start(body.prompt, req.headers["idempotency-key"]) });
        }
      }
      const assistantRun = path.match(/^\/api\/assistant\/runs\/([a-zA-Z0-9-]+)(\/cancel)?$/);
      if (assistantRun) {
        requireAssistant();
        if (!options.assistant) throw new HttpError(503, "agent_disabled", "Start the lab with --agent to enable a real assistant.");
        if (req.method === "GET" && !assistantRun[2]) return send(200, { run: await options.assistant.get(assistantRun[1]) });
        if (req.method === "POST" && assistantRun[2]) return send(200, { run: await options.assistant.cancel(assistantRun[1]) });
      }
      if (path === "/api/work" && req.method === "POST") {
        requireAssistant();
        const body = await jsonBody(req);
        const source = body.source as { reference?: unknown; versionId?: unknown } | undefined;
        if (body.patientId !== options.fixture.patientId || source?.reference !== options.fixture.source.reference || source?.versionId !== options.fixture.source.versionId) {
          throw new HttpError(400, "fixture_required", "Use only the patient and result returned by /api/fixture.");
        }
        const key = req.headers["idempotency-key"];
        if (typeof key !== "string") throw new HttpError(400, "idempotency_key_required", "Send a unique idempotency-key header and reuse it when retrying the same draft.");
        const job = await options.service.submit(LAB_ASSISTANT, body, key);
        return send(201, { job });
      }
      const assistantWork = path.match(/^\/api\/work\/([a-zA-Z0-9-]+)(\/cancel)?$/);
      if (assistantWork) {
        requireAssistant();
        if (req.method === "GET" && !assistantWork[2]) return send(200, { job: await options.service.get(LAB_ASSISTANT, assistantWork[1]) });
        if (req.method === "POST" && assistantWork[2]) return send(200, { job: await options.service.cancel(LAB_ASSISTANT, assistantWork[1]) });
      }
      if (path.startsWith("/api/reviewer/")) {
        requireReviewer();
        if (path === "/api/reviewer/work" && req.method === "GET") return send(200, { jobs: await options.service.list(LAB_REVIEWER) });
        if (path === "/api/reviewer/recover" && req.method === "POST") {
          await options.service.recover();
          return send(200, { reconciled: true });
        }
        const decision = path.match(/^\/api\/reviewer\/work\/([a-zA-Z0-9-]+)\/decision$/);
        if (decision && req.method === "POST") return send(200, { job: await options.service.decide(LAB_REVIEWER, decision[1], await jsonBody(req)) });
      }
      throw new HttpError(404, "not_found", "This lab endpoint was not found.");
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error instanceof HttpError) return send(error.status, { error: error.code, message: error.message });
      // Never serialize backend/SQLite/provider diagnostics or request content.
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "request_failed";
      const publicErrors: Record<string, [number, string]> = {
        forbidden: [403, "This identity cannot perform that action."],
        not_found: [404, "Work was not found for this identity."],
        invalid_input: [400, "The draft or decision is invalid. Check the API contract."],
        conflict: [409, "The work changed or this key was already used for a different draft. Refresh before deciding."],
        stale_proposal: [409, "The proposal changed. Refresh and review the current resource."],
        expired: [410, "The review period expired. Submit a fresh proposal."],
      };
      const [status, message] = publicErrors[code] ?? [500, "The lab could not complete this request. No automatic create retry was attempted."];
      send(status, { error: publicErrors[code] ? code : "request_failed", message });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
