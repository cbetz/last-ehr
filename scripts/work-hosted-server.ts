import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { HostedWorkAuthError, type createHostedWorkAuth } from "../lib/work/hosted-auth";
import { createHostedWorkMcpHandler } from "../lib/work/hosted-mcp";
import { WorkError, type DurableWorkService } from "../lib/work/service";
import type { WorkAssistantContext } from "../lib/work/context";
import { hostedWorkCss, hostedWorkPage, hostedWorkScript } from "./work-hosted-page";

type Auth = ReturnType<typeof createHostedWorkAuth>;
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }

function cookie(req: IncomingMessage, name: string): string | undefined {
  const values = req.headers.cookie?.split(";").map((value) => value.trim()).filter((value) => value.startsWith(`${name}=`));
  return values?.length === 1 ? values[0].slice(name.length + 1) : undefined;
}

async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") throw new HttpError(415, "json_required", "Send an application/json request.");
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const part of req) { const chunk = Buffer.from(part); bytes += chunk.length; if (bytes > 12_000) throw new HttpError(413, "body_too_large", "The request exceeds the size limit."); chunks.push(chunk); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "invalid_json", "Send a valid JSON object."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_json", "Send a valid JSON object.");
  return body as Record<string, unknown>;
}

/** Hosted transport is separate from the disposable-key, loopback-only Work Lab. */
export function createHostedWorkServer(options: {
  publicOrigin: string; issuer: string; auth: Auth; service: DurableWorkService;
  readContext: () => Promise<WorkAssistantContext>; allowInsecureLoopback?: true;
}) {
  const origin = new URL(options.publicOrigin);
  const testHttp = options.allowInsecureLoopback === true && process.env.NODE_ENV === "test" && origin.hostname === "127.0.0.1" && origin.protocol === "http:";
  if (origin.origin !== options.publicOrigin || origin.username || origin.password || (origin.protocol !== "https:" && !testHttp)) throw new Error("Use a fixed HTTPS public origin.");
  const secure = origin.protocol === "https:";
  const loginName = secure ? "__Host-last_work_login" : "last_work_login_test";
  const sessionName = secure ? "__Host-last_work_reviewer" : "last_work_reviewer_test";
  const cookieHeader = (name: string, value: string, seconds: number, sameSite: string) => `${name}=${value}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=${sameSite}; Path=/; Max-Age=${seconds}`;
  const mcp = createHostedWorkMcpHandler({
    publicUrl: `${options.publicOrigin}/mcp`, issuer: options.issuer, service: options.service,
    readContext: options.readContext, verifyAssistant: (value) => options.auth.verifyAssistant(value),
  });
  let closing = false;
  const lifecycle = new AbortController();
  const active = new Set<Promise<void>>();
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const send = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };
    const redirect = (location: string) => { res.writeHead(303, { location }); res.end(); };
    try {
      if (closing) throw new HttpError(503, "service_stopping", "Last is stopping. Reconnect after the service restarts.");
      if (req.headers.host !== origin.host) throw new HttpError(400, "invalid_host", "Use the configured Work origin.");
      const url = new URL(req.url || "/", options.publicOrigin);
      if (url.origin !== options.publicOrigin) throw new HttpError(400, "invalid_url", "Use a relative Work path.");
      if (url.pathname === mcp.paths.mcp || url.pathname === mcp.paths.metadata) return await mcp.listener(req, res);
      if (req.headers.origin && req.headers.origin !== options.publicOrigin) throw new HttpError(403, "invalid_origin", "Cross-origin reviewer requests are not allowed.");
      if (url.pathname !== "/auth/callback" && url.search) throw new HttpError(400, "query_not_supported", "This endpoint does not accept query parameters.");
      if (req.method === "GET" && url.pathname === "/health") return send(200, { status: "ready", mode: "synthetic-only" });
      if (req.method === "GET" && ["/", "/styles.css", "/app.js"].includes(url.pathname)) {
        const css = url.pathname === "/styles.css", script = url.pathname === "/app.js";
        res.writeHead(200, { "content-type": css ? "text/css; charset=utf-8" : script ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8" });
        res.end(css ? hostedWorkCss : script ? hostedWorkScript : testHttp ? hostedWorkPage.replace("Synthetic pilot</span>", "Synthetic identity test</span>") : hostedWorkPage);
        return;
      }
      if (req.method === "GET" && url.pathname === "/auth/login") {
        const login = options.auth.beginReviewerLogin();
        res.setHeader("set-cookie", cookieHeader(loginName, login.loginCookie, 300, "Lax"));
        return redirect(login.location);
      }
      if (req.method === "GET" && url.pathname === "/auth/callback") {
        // Always clear the browser binding, including failed callbacks.
        res.setHeader("set-cookie", cookieHeader(loginName, "", 0, "Lax"));
        if ([...url.searchParams].some(([name]) => !["code", "state", "session_state", "iss"].includes(name)) ||
          url.searchParams.getAll("code").length !== 1 || url.searchParams.getAll("state").length !== 1 ||
          url.searchParams.getAll("iss").length > 1 || (url.searchParams.has("iss") && url.searchParams.get("iss") !== options.issuer)) throw new HttpError(400, "invalid_callback", "Start a new reviewer sign-in.");
        const result = await options.auth.finishReviewerLogin({ code: url.searchParams.get("code")!, state: url.searchParams.get("state")!, loginCookie: cookie(req, loginName) || "" });
        const previous = cookie(req, sessionName); if (previous) options.auth.endReviewerSession(previous);
        res.setHeader("set-cookie", [cookieHeader(loginName, "", 0, "Lax"), cookieHeader(sessionName, result.sessionCookie, Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000)), "Strict")]);
        return redirect("/");
      }
      if (url.pathname.startsWith("/api/reviewer/")) {
        const session = options.auth.getReviewerSession(cookie(req, sessionName));
        if (!session) throw new HttpError(401, "reviewer_auth_required", "Sign in with the configured reviewer account.");
        if (req.method !== "GET" && (req.headers.origin !== options.publicOrigin || req.headers["x-last-work-request"] !== "reviewer")) throw new HttpError(403, "reviewer_origin_required", "Use the separate reviewer page for this decision.");
        if (url.pathname === "/api/reviewer/session") {
          if (req.method === "GET") return send(200, { actor: session.actor, expiresAt: session.expiresAt });
          if (req.method === "DELETE") {
            options.auth.endReviewerSession(cookie(req, sessionName));
            res.setHeader("set-cookie", cookieHeader(sessionName, "", 0, "Strict"));
            return send(200, { signedIn: false });
          }
        }
        if (url.pathname === "/api/reviewer/work" && req.method === "GET") return send(200, { jobs: await options.service.list(session.actor) });
        if (url.pathname === "/api/reviewer/recover" && req.method === "POST") {
          const body = await jsonBody(req); if (Object.keys(body).length) throw new WorkError("invalid_input");
          const checked = await options.service.recover({ limit: 10, signal: lifecycle.signal });
          return send(200, { reconciled: true, checked: checked.length, batchLimit: 10 });
        }
        const reconcile = url.pathname.match(/^\/api\/reviewer\/work\/([a-f0-9-]{36})\/reconcile$/);
        if (reconcile && req.method === "POST") {
          const body = await jsonBody(req); if (Object.keys(body).length) throw new WorkError("invalid_input");
          await options.service.get(session.actor, reconcile[1]);
          await options.service.recover({ workId: reconcile[1], limit: 1, signal: lifecycle.signal });
          return send(200, { job: await options.service.get(session.actor, reconcile[1]) });
        }
        const decision = url.pathname.match(/^\/api\/reviewer\/work\/([a-f0-9-]{36})\/decision$/);
        if (decision && req.method === "POST") return send(200, { job: await options.service.decide(session.actor, decision[1], await jsonBody(req)) });
      }
      throw new HttpError(404, "not_found", "This Work endpoint was not found.");
    } catch (error) {
      if (res.headersSent || res.destroyed) { res.end(); return; }
      if (error instanceof HttpError) return send(error.status, { error: error.code, message: error.message });
      if (error instanceof HostedWorkAuthError) return send(401, { error: error.code, message: error.message });
      if (error instanceof WorkError) {
        const status = { invalid_input: 400, forbidden: 403, not_found: 404, conflict: 409, expired: 410 }[error.code];
        return send(status, { error: error.code, message: error.message });
      }
      send(500, { error: "request_failed", message: "Last could not complete this request. Refresh the current work state before retrying." });
    }
  };
  const server = createServer((req, res) => {
    const operation = handle(req, res);
    active.add(operation);
    void operation.catch(() => { if (!res.destroyed) res.destroy(); }).finally(() => active.delete(operation));
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5_000;
  let closingPromise: Promise<void> | undefined;
  return {
    server,
    close(): Promise<void> {
      if (closingPromise) return closingPromise;
      closing = true; lifecycle.abort();
      closingPromise = (async () => {
        const grace = setTimeout(() => server.closeAllConnections(), 20_000); grace.unref();
        try {
          await mcp.close();
          await new Promise<void>((accept, reject) => { if (!server.listening) return accept(); server.close((error) => error ? reject(error) : accept()); server.closeIdleConnections(); });
          await Promise.allSettled([...active]);
        } finally { clearTimeout(grace); options.auth.close(); }
      })();
      return closingPromise;
    },
  };
}
