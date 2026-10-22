import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { isIP } from "node:net";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const KEYCLOAK_IMAGE = "quay.io/keycloak/keycloak:26.8.1@sha256:79c623a22abacf3fe6c00a5fb30f5b7843d717b234033b80995891c06116d244";
export const MEDPLUM_IMAGE = "medplum/medplum-server:5.1.35@sha256:588ea41bb49b76c6fd6e381dce2391b5f61653b4e35ea36053721260816c4007";

// Do not inherit model, FHIR, OAuth or tunnel credentials from the checkout.
const commandEnvironment: NodeJS.ProcessEnv = { NODE_ENV: "test", ...Object.fromEntries([
  "PATH", "HOME", "USER", "TMPDIR", "DOCKER_HOST", "DOCKER_CONTEXT",
  "DOCKER_CONFIG", "XDG_RUNTIME_DIR", "SSL_CERT_FILE", "SSL_CERT_DIR",
].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])) };

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback allocation failed");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

function interrupted(): Error {
  return Object.assign(new Error("Synthetic runtime interrupted."), { name: "AbortError", code: "ABORT_ERR" });
}

function abortCheck(signal?: AbortSignal): void {
  if (signal?.aborted) throw interrupted();
}

async function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(interrupted());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    if (signal.aborted) onAbort();
  });
}

export async function waitFor(check: () => Promise<boolean>, milliseconds = 180_000, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    abortCheck(signal);
    try { if (await withSignal(check(), signal)) return; } catch { abortCheck(signal); }
    await new Promise<void>((resolve, reject) => {
      const finish = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
      const timeout = setTimeout(finish, 1000);
      const onAbort = () => { clearTimeout(timeout); reject(interrupted()); };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }
  throw new Error("Service readiness deadline exceeded");
}

export async function ready(url: string, expected = 200): Promise<boolean> {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3000) });
  await response.body?.cancel();
  return response.status === expected;
}

export async function preflight(): Promise<void> {
  // Inspect local CLI context metadata before contacting the daemon. Ambient
  // SSH/TCP Docker contexts must never move this synthetic stack off-machine.
  let dockerEndpoint: string;
  try {
    dockerEndpoint = commandEnvironment.DOCKER_HOST && !commandEnvironment.DOCKER_CONTEXT
      ? commandEnvironment.DOCKER_HOST
      : (await exec("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], {
        env: commandEnvironment, timeout: 15_000,
      })).stdout.trim();
  } catch {
    throw new Error("Docker with a local context is required; start Docker before retrying");
  }
  assertLocalDockerEndpoint(dockerEndpoint);
  try {
    await exec("docker", ["info", "--format", "{{.ServerVersion}}"], { env: commandEnvironment, timeout: 15_000 });
    await exec("docker", ["compose", "version"], { env: commandEnvironment, timeout: 15_000 });
    await exec("cloudflared", ["--version"], { env: commandEnvironment, timeout: 15_000 });
  } catch {
    throw new Error("Docker with Compose and cloudflared are required; start Docker before retrying");
  }
}

export function assertLocalDockerEndpoint(value: string): void {
  if (!/^unix:\/\/\/[^\r\n]+$/.test(value) && !/^npipe:\/\/\/\/\.\/pipe\/[^\r\n]+$/.test(value)) {
    throw new Error("Synthetic verification requires a local Docker unix/npipe endpoint; remote Docker contexts are refused.");
  }
}

export type UserInfoProxy = {
  port: number;
  path: string;
  successfulRequests: () => number;
  close: () => Promise<void>;
};

/** Only the real IdP's bearer-protected UserInfo GET can cross the tunnel. */
export async function startUserInfoProxy(target: string, runId: string): Promise<UserInfoProxy> {
  const route = `/userinfo/${runId}`;
  let successful = 0;
  const server = createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", "application/json");
    if (request.url !== route) { response.writeHead(404).end('{"error":"not_found"}'); return; }
    if (request.method !== "GET") { response.writeHead(405).end('{"error":"method_not_allowed"}'); return; }
    const authorization = request.headers.authorization;
    if (!authorization || authorization.length > 16_384 || !/^Bearer [A-Za-z0-9._~+\/-]+=*$/i.test(authorization)) {
      response.writeHead(401).end('{"error":"invalid_token"}'); return;
    }
    try {
      const upstream = await fetch(target, {
        headers: { authorization }, redirect: "error", signal: AbortSignal.timeout(10_000),
      });
      if (upstream.status !== 200) {
        await upstream.body?.cancel();
        response.writeHead(upstream.status === 401 || upstream.status === 403 ? upstream.status : 502)
          .end('{"error":"userinfo_failed"}');
        return;
      }
      const reader = upstream.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (!reader) throw new Error("Empty UserInfo");
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 65_536) throw new Error("Oversized UserInfo");
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const body = Buffer.concat(chunks);
      const claims = JSON.parse(body.toString("utf8"));
      if (!claims || typeof claims !== "object" || typeof claims.sub !== "string") throw new Error("Invalid UserInfo");
      successful += 1;
      response.writeHead(200).end(body);
    } catch {
      response.writeHead(502).end('{"error":"userinfo_failed"}');
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    port: (server.address() as { port: number }).port,
    path: route,
    successfulRequests: () => successful,
    close: () => closeServer(server),
  };
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

export async function stopProcess(child: ChildProcess, processGroup = false): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => {
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (processGroup && process.platform !== "win32") process.kill(-child.pid!, signal);
        else child.kill(signal);
      } catch { /* an exit can race the signal */ }
    };
    const deadline = setTimeout(() => kill("SIGKILL"), 5000);
    child.once("exit", () => { clearTimeout(deadline); resolve(); });
    kill("SIGTERM");
  });
}

function publicIpv4(value: string): boolean {
  if (isIP(value) !== 4) return false;
  const [a, b, c] = value.split(".").map(Number);
  return !(
    [0, 10, 127].includes(a) || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19].includes(b)) || (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

async function tunnelDnsPublished(origin: string, fetchFn: typeof fetch, signal?: AbortSignal): Promise<boolean> {
  const query = new URL("https://cloudflare-dns.com/dns-query");
  query.searchParams.set("name", new URL(origin).hostname);
  query.searchParams.set("type", "A");
  const response = await fetchFn(query, {
    headers: { accept: "application/dns-json" }, redirect: "error",
    signal: AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]),
  });
  const reader = response.body?.getReader();
  if (!response.ok || !reader) { void response.body?.cancel().catch(() => {}); return false; }
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 65_536) return false;
      chunks.push(part.value);
    }
    const answer = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return answer?.Status === 0 && Array.isArray(answer.Answer) &&
      answer.Answer.some((entry: { type?: unknown; data?: unknown }) =>
        entry.type === 1 && typeof entry.data === "string" && publicIpv4(entry.data));
  } finally { void reader.cancel().catch(() => {}); }
}

export async function startTunnel(
  proxyPort: number,
  directory: string,
  signal?: AbortSignal,
  options: { cloudflaredBinary?: string; fetchFn?: typeof fetch } = {},
): Promise<{ origin: string; close: () => Promise<void> }> {
  abortCheck(signal);
  // An empty HOME keeps an existing user's named tunnels/configuration out of this run.
  const child = spawn(options.cloudflaredBinary ?? "cloudflared", ["tunnel", "--no-autoupdate", "--protocol", "http2", "--edge-ip-version", "4", "--url", `http://127.0.0.1:${proxyPort}`], {
    env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: directory, TMPDIR: process.env.TMPDIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lifetime = new AbortController();
  const combined = AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);
  let closing: Promise<void> | undefined;
  const close = () => {
    lifetime.abort();
    return closing ??= stopProcess(child).finally(() => signal?.removeEventListener("abort", onAbort));
  };
  const onAbort = () => { void close(); };
  signal?.addEventListener("abort", onAbort, { once: true });
  const stopped = new Promise<never>((_, reject) => {
    child.once("exit", () => reject(new Error("Public HTTPS tunnel stopped")));
    child.once("error", () => reject(new Error("Public HTTPS tunnel could not start")));
  });
  void stopped.catch(() => {});
  try {
    const origin = await withSignal(new Promise<string>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("Public HTTPS tunnel startup timed out")), 60_000);
      let pending = "";
      const receive = (chunk: Buffer) => {
        pending = (pending + chunk.toString("utf8")).slice(-16_384);
        const found = pending.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
        if (found) { clearTimeout(deadline); resolve(found[0]); }
      };
      child.stdout?.on("data", receive);
      child.stderr?.on("data", receive);
      child.once("error", () => { clearTimeout(deadline); reject(new Error("Public HTTPS tunnel could not start")); });
      child.once("exit", () => { clearTimeout(deadline); reject(new Error("Public HTTPS tunnel stopped")); });
    }), combined);
    // Quick Tunnel DNS can initially return NXDOMAIN. Wait via DNS-over-HTTPS
    // before the first native hostname lookup can populate a negative cache.
    // This does not override DNS, TLS, or Medplum's native SSRF checks.
    await withSignal(Promise.race([
      waitFor(() => tunnelDnsPublished(origin, options.fetchFn ?? fetch, combined), 120_000, combined),
      stopped,
    ]), combined);
    return { origin, close };
  } catch (error) { await close(); throw error; }
}

export async function createRuntime(runId: string, options: { dockerBinary?: string } = {}) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(runId)) throw new Error("Invalid synthetic runtime identifier");
  const directory = await mkdtemp(path.join(tmpdir(), "lastehr-remote-"));
  await chmod(directory, 0o700);
  const composeFile = path.join(directory, "compose.json");
  const envFile = path.join(directory, "empty.env");
  await writeFile(envFile, "", { mode: 0o600 });
  const projectName = `lastehr-remote-${runId}`;
  let activeChild: ChildProcess | undefined;
  const compose = (args: string[], timeout = 300_000, signal?: AbortSignal): Promise<void> => {
    abortCheck(signal);
    const child = spawn(options.dockerBinary ?? "docker", [
      "compose", "--env-file", envFile, "--project-name", projectName, "--file", composeFile, ...args,
    ], {
      cwd: directory, env: commandEnvironment, stdio: "ignore", detached: process.platform !== "win32",
    });
    activeChild = child;
    return new Promise<void>((resolve, reject) => {
      let timedOut = false;
      const stop = () => { void stopProcess(child, true); };
      const deadline = setTimeout(() => { timedOut = true; stop(); }, timeout);
      const finish = (error?: Error) => {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", stop);
        if (activeChild === child) activeChild = undefined;
        if (error) reject(error); else resolve();
      };
      child.once("error", () => finish(new Error("Owned Docker command could not start")));
      child.once("exit", (code) => finish(
        signal?.aborted ? interrupted()
          : code === 0 && !timedOut ? undefined : new Error("Owned Docker command failed"),
      ));
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) stop();
    });
  };
  let configured = false;
  let closed = false;
  let closing: Promise<void> | undefined;
  let startup: Promise<void> | undefined;
  let startupAbort: AbortController | undefined;
  const assertOpen = () => { if (closed) throw interrupted(); };
  return {
    directory,
    projectName,
    async write(name: string, data: unknown) {
      assertOpen();
      if (path.basename(name) !== name || !name || name === "." || name === "..") throw new Error("Invalid synthetic runtime filename");
      const filename = path.join(directory, name);
      await writeFile(filename, JSON.stringify(data, null, 2), { mode: 0o600 });
      return filename;
    },
    start(config: unknown, signal?: AbortSignal) {
      assertOpen();
      abortCheck(signal);
      if (startup) throw new Error("Synthetic runtime was already started");
      startupAbort = new AbortController();
      const combined = AbortSignal.any([startupAbort.signal, ...(signal ? [signal] : [])]);
      startup = (async () => {
        await writeFile(composeFile, JSON.stringify(config, null, 2), { mode: 0o600 });
        assertOpen();
        abortCheck(combined);
        configured = true;
        try { await compose(["up", "--detach", "--wait", "--wait-timeout", "180"], 300_000, combined); }
        catch { if (combined.aborted) throw interrupted(); throw new Error("Disposable identity/FHIR stack failed to start"); }
      })();
      return startup;
    },
    close() {
      if (closing) return closing;
      closed = true;
      startupAbort?.abort();
      closing = (async () => {
        if (activeChild) await stopProcess(activeChild, true);
        await startup?.catch(() => {});
        try {
          if (configured) await compose(["down", "--volumes", "--remove-orphans"], 60_000);
        } catch {
          // Keep the private compose/config files for exact owned-project
          // recovery; deleting them would strand a still-running fixture.
          throw new Error(`Owned Docker stack cleanup failed. Recovery directory: ${directory}; project: ${projectName}`);
        }
        await rm(directory, { recursive: true, force: true });
      })();
      return closing;
    },
  };
}
