import { createServer } from "node:http";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertLocalDockerEndpoint, createRuntime, startTunnel, startUserInfoProxy, waitFor } from "./runtime";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  try { for (const close of cleanup.splice(0).reverse()) await close(); }
  finally { vi.unstubAllEnvs(); }
});

async function fixture(reply: (response: import("node:http").ServerResponse) => void) {
  let requests = 0;
  const server = createServer((_request, response) => { requests += 1; reply(response); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const port = (server.address() as { port: number }).port;
  const proxy = await startUserInfoProxy(`http://127.0.0.1:${port}/real-userinfo`, "fixture");
  cleanup.push(proxy.close);
  return { url: `http://127.0.0.1:${proxy.port}`, proxy, requests: () => requests };
}

describe("public UserInfo tunnel boundary", () => {
  it("exposes only the exact bearer-protected UserInfo GET", async () => {
    const f = await fixture(response => response.end(JSON.stringify({ sub: "synthetic-user" })));
    const cases = [
      ["/admin", "GET", 404],
      ["/userinfo/fixture?target=http://elsewhere.invalid", "GET", 404],
      ["/userinfo/fixture", "POST", 405],
      ["/userinfo/fixture", "GET", 401],
    ] as const;
    for (const [route, method, status] of cases) {
      const response = await fetch(f.url + route, { method });
      expect(response.status).toBe(status);
      await response.body?.cancel();
    }
    expect(f.requests()).toBe(0);
    const response = await fetch(f.url + f.proxy.path, { headers: { authorization: "Bearer synthetic-token" } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sub: "synthetic-user" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(f.proxy.successfulRequests()).toBe(1);
  });

  it.each(["redirect", "oversized", "malformed", "missing-sub", "upstream-error"])("scrubs %s responses", async scenario => {
    const sentinel = "PRIVATE-UPSTREAM-DIAGNOSTIC";
    const f = await fixture(response => {
      if (scenario === "redirect") response.writeHead(302, { location: "http://127.0.0.1:1" }).end();
      else if (scenario === "oversized") response.end(JSON.stringify({ sub: sentinel, extra: "x".repeat(65_536) }));
      else if (scenario === "malformed") response.end(sentinel);
      else if (scenario === "missing-sub") response.end(JSON.stringify({ error: sentinel }));
      else response.writeHead(500).end(sentinel);
    });
    const response = await fetch(f.url + f.proxy.path, { headers: { authorization: "Bearer synthetic-token" } });
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"error":"userinfo_failed"}');
    expect(f.proxy.successfulRequests()).toBe(0);
  });
});

async function executableFixture(body: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "lastehr-runtime-test-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const binary = path.join(directory, "fixture.cjs");
  const events = path.join(directory, "events.jsonl");
  const pidFile = path.join(directory, "child.pid");
  await writeFile(binary, `#!${process.execPath}\nconst fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nconst record = event => fs.appendFileSync(${JSON.stringify(events)}, JSON.stringify(event) + "\\n");\n${body}\n`);
  await chmod(binary, 0o700);
  return {
    binary, directory,
    pid: async () => Number(await readFile(pidFile, "utf8")),
    events: async () => {
      try { return (await readFile(events, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); }
      catch { return []; }
    },
  };
}

describe("owned synthetic runtime lifecycle", () => {
  it.each(["unix:///var/run/docker.sock", "npipe:////./pipe/docker_engine"])("accepts a local endpoint %s", endpoint => {
    expect(() => assertLocalDockerEndpoint(endpoint)).not.toThrow();
  });

  it.each(["ssh://user@remote", "tcp://remote:2376", "tcp://127.0.0.1:2375", "npipe:////remote/pipe/docker_engine", "unix://remote/socket"])("refuses a nonlocal endpoint %s", endpoint => {
    expect(() => assertLocalDockerEndpoint(endpoint)).toThrow("local Docker");
  });

  it("stops an in-flight compose up before down and closes idempotently", async () => {
    const fixture = await executableFixture(`
if (process.argv.includes("up")) {
  process.on("SIGTERM", () => { record("up-stopped"); process.exit(0); });
  setInterval(() => {}, 1000);
  record("up");
} else if (process.argv.includes("down")) { record("down"); }
else process.exit(2);`);
    const runtime = await createRuntime("cancel-test", { dockerBinary: fixture.binary });
    cleanup.push(async () => { await runtime.close().catch(() => {}); await rm(runtime.directory, { recursive: true, force: true }); });
    expect((await stat(runtime.directory)).mode & 0o777).toBe(0o700);
    const configFile = await runtime.write("synthetic.json", { synthetic: true });
    expect((await stat(configFile)).mode & 0o777).toBe(0o600);
    const starting = runtime.start({ services: {} });
    void starting.catch(() => {});
    await waitFor(async () => (await fixture.events()).includes("up"), 5000);
    const upPid = await fixture.pid();
    const firstClose = runtime.close();
    expect(runtime.close()).toBe(firstClose);
    await firstClose;
    await expect(starting).rejects.toMatchObject({ code: "ABORT_ERR" });
    expect(await fixture.events()).toEqual(["up", "up-stopped", "down"]);
    expect(() => process.kill(upPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
    await expect(stat(runtime.directory)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(runtime.write("later.json", {})).rejects.toMatchObject({ code: "ABORT_ERR" });
    expect(() => runtime.start({})).toThrow("interrupted");
  });

  it("honors caller interruption and preserves recovery files when down fails", async () => {
    const fixture = await executableFixture(`
if (process.argv.includes("up")) {
  process.on("SIGTERM", () => { record("up-stopped"); process.exit(0); });
  setInterval(() => {}, 1000);
  record("up");
} else if (process.argv.includes("down")) { record("down-failed"); process.exit(1); }
else process.exit(2);`);
    const runtime = await createRuntime("recover-test", { dockerBinary: fixture.binary });
    cleanup.push(() => rm(runtime.directory, { recursive: true, force: true }));
    const controller = new AbortController();
    const starting = runtime.start({ services: {} }, controller.signal);
    void starting.catch(() => {});
    await waitFor(async () => (await fixture.events()).includes("up"), 5000);
    const upPid = await fixture.pid();
    controller.abort(new Error("PRIVATE_INTERRUPT_REASON"));
    await expect(starting).rejects.toMatchObject({ code: "ABORT_ERR" });
    await expect(runtime.close()).rejects.toThrow(`Recovery directory: ${runtime.directory}; project: ${runtime.projectName}`);
    expect(JSON.parse(await readFile(path.join(runtime.directory, "compose.json"), "utf8"))).toEqual({ services: {} });
    expect((await stat(runtime.directory)).mode & 0o777).toBe(0o700);
    expect(await fixture.events()).toEqual(["up", "up-stopped", "down-failed"]);
    expect(() => process.kill(upPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });

  it("interrupts both an unresolved readiness check and the retry sleep", async () => {
    for (const check of [() => new Promise<boolean>(() => {}), async () => false]) {
      const controller = new AbortController();
      const waiting = waitFor(check, 180_000, controller.signal);
      setTimeout(() => controller.abort(new Error("PRIVATE_INTERRUPT_REASON")), 20);
      await expect(waiting).rejects.toMatchObject({ code: "ABORT_ERR", message: "Synthetic runtime interrupted." });
    }
  });
});

describe("account-free Quick Tunnel startup", () => {
  async function tunnelFixture() {
    return executableFixture(`
const args = process.argv.slice(2);
const configFile = args[args.indexOf("--config") + 1];
const configDirectory = require("node:path").dirname(configFile);
fs.writeFileSync(require("node:path").join(__dirname, "tunnel-invocation.json"), JSON.stringify({
  args, home: process.env.HOME, environmentKeys: Object.keys(process.env),
  config: fs.readFileSync(configFile, "utf8"),
  configMode: fs.statSync(configFile).mode & 0o777,
  directoryMode: fs.statSync(configDirectory).mode & 0o777,
}));
process.on("SIGTERM", () => { record("stopped"); process.exit(0); });
setInterval(() => {}, 1000);
// Publish readiness only after the signal handler can observe cancellation.
record("started");
process.stderr.write("https://synthetic-runtime-test.trycloudflare.com\\n");`);
  }

  it("forces an empty private config and excludes ambient account credentials", async () => {
    vi.stubEnv("TUNNEL_TOKEN", "PRIVATE_TUNNEL_ACCOUNT_TOKEN");
    vi.stubEnv("TUNNEL_NAME", "PRIVATE_NAMED_TUNNEL");
    vi.stubEnv("TUNNEL_ORIGIN_CERT", "/private/account/cert.pem");
    vi.stubEnv("TUNNEL_CONFIG", "/private/account/config.yml");
    const fixture = await tunnelFixture();
    const tunnel = await startTunnel(12345, fixture.directory, undefined, {
      cloudflaredBinary: fixture.binary,
      fetchFn: async () => Response.json({ Status: 0, Answer: [{ type: 1, data: "104.16.0.1" }] }),
    });
    cleanup.push(tunnel.close);
    const invocation = JSON.parse(await readFile(path.join(fixture.directory, "tunnel-invocation.json"), "utf8"));
    const configFile = invocation.args[invocation.args.indexOf("--config") + 1];
    const configDirectory = path.dirname(configFile);
    expect(path.dirname(configDirectory)).toBe(fixture.directory);
    expect(invocation.home).toBe(configDirectory);
    expect(invocation.config).toBe("{}\n");
    expect(invocation.configMode).toBe(0o600);
    expect(invocation.directoryMode).toBe(0o700);
    expect(invocation.environmentKeys.filter((key: string) => key.startsWith("TUNNEL_"))).toEqual([]);
    expect(invocation.args).toEqual([
      "tunnel", "--config", configFile, "--no-autoupdate", "--protocol", "http2", "--edge-ip-version", "4",
      "--url", "http://127.0.0.1:12345",
    ]);
    await tunnel.close();
    await expect(stat(configDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await stat(fixture.directory)).isDirectory()).toBe(true);
  });

  it("waits for published public DNS before returning the fresh origin", async () => {
    const fixture = await tunnelFixture();
    let calls = 0;
    const fetchFn: typeof fetch = async input => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://cloudflare-dns.com");
      expect(url.searchParams.get("name")).toBe("synthetic-runtime-test.trycloudflare.com");
      calls += 1;
      return Response.json(calls === 1
        ? { Status: 3 }
        : calls === 2 ? { Status: 0, Answer: [{ type: 1, data: "127.0.0.1" }] }
          : { Status: 0, Answer: [{ type: 1, data: "104.16.0.1" }] });
    };
    const tunnel = await startTunnel(12345, fixture.directory, undefined, { cloudflaredBinary: fixture.binary, fetchFn });
    cleanup.push(tunnel.close);
    expect(calls).toBe(3);
    expect(tunnel.origin).toBe("https://synthetic-runtime-test.trycloudflare.com");
    const closing = tunnel.close();
    expect(tunnel.close()).toBe(closing);
    await closing;
    expect(await fixture.events()).toEqual(["started", "stopped"]);
    const pid = await fixture.pid();
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });

  it("closes its tunnel when interrupted during DNS publication", async () => {
    const fixture = await tunnelFixture();
    const controller = new AbortController();
    let probing: (() => void) | undefined;
    const started = new Promise<void>(resolve => { probing = resolve; });
    const fetchFn: typeof fetch = async (_input, init) => {
      probing!();
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(new Error("PRIVATE_DNS_ERROR")), { once: true });
      });
    };
    const opening = startTunnel(12345, fixture.directory, controller.signal, { cloudflaredBinary: fixture.binary, fetchFn });
    void opening.catch(() => {});
    await started;
    controller.abort();
    await expect(opening).rejects.toMatchObject({ code: "ABORT_ERR" });
    expect(await fixture.events()).toEqual(["started", "stopped"]);
    const invocation = JSON.parse(await readFile(path.join(fixture.directory, "tunnel-invocation.json"), "utf8"));
    await expect(stat(invocation.home)).rejects.toMatchObject({ code: "ENOENT" });
    const pid = await fixture.pid();
    expect(() => process.kill(pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
  });
});
