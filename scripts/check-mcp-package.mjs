import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, "packages/mcp/package.json"), "utf8"));
const registry = JSON.parse(await readFile(path.join(root, "packages/mcp/server.json"), "utf8"));
const args = process.argv.slice(2);
assert(args.every(arg => arg === "--published"), "Usage: node scripts/check-mcp-package.mjs [--published]");
assert.equal(manifest.version, registry.version, "Package and registry versions must match");
const packDirectory = path.join(root, "artifacts/mcp-release");
await mkdir(packDirectory, { recursive: true });

async function run(command, arguments_, options = {}) {
  return exec(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
}

// The installed package lives outside the checkout: missing dependencies must
// not silently resolve from this repository's node_modules.
const temporary = await mkdtemp(path.join(tmpdir(), "lastehr-package-"));
const requestMethods = [];
const fixture = createServer((request, response) => {
  requestMethods.push(request.method);
  const url = new URL(request.url, "http://127.0.0.1");
  response.setHeader("Content-Type", "application/fhir+json");
  if (request.method !== "GET") {
    response.writeHead(405).end();
  } else if (url.pathname === "/fhir/metadata") {
    response.end(JSON.stringify({
      resourceType: "CapabilityStatement", status: "active", kind: "instance",
      fhirVersion: "4.0.1", format: ["application/fhir+json"],
      rest: [{ mode: "server", resource: [{ type: "Patient", interaction: [{ code: "search-type" }] }] }],
    }));
  } else if (url.pathname === "/fhir/Patient") {
    response.end(JSON.stringify({
      resourceType: "Bundle", type: "searchset", total: url.searchParams.has("_summary") ? 0 : 1,
      entry: url.searchParams.has("_summary") ? [] : [{
        resource: { resourceType: "Patient", id: "package-smoke-fixture", name: [{ given: ["PackageSmoke"], family: "Synthetic" }] },
      }],
    }));
  } else {
    response.writeHead(404).end();
  }
});

try {
  const packArgs = args.includes("--published")
    ? [`${manifest.name}@${manifest.version}`]
    : ["--workspace=@lastehr/mcp"];
  const packed = JSON.parse((await run("npm", ["pack", ...packArgs, "--json", "--pack-destination", packDirectory])).stdout)[0];
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  if (process.env.LASTEHR_RELEASE_INTEGRITY) {
    assert.equal(packed.integrity, process.env.LASTEHR_RELEASE_INTEGRITY, "Published artifact differs from the verified tarball");
  }
  if (args.includes("--published")) {
    const response = await fetch("https://registry.npmjs.org/@lastehr%2fmcp", { signal: AbortSignal.timeout(10_000) });
    assert(response.ok, "Could not read public npm metadata");
    const published = await response.json();
    assert.equal(published["dist-tags"].latest, manifest.version, "Default npm installation does not resolve to the verified version");
  }
  if (packed.files) {
    for (const file of packed.files) {
      assert(/^(dist\/|README\.md$|LICENSE$|package\.json$|server\.json$)/.test(file.path), `Unexpected packed file: ${file.path}`);
      assert(!/(^|\/)(\.env[^/]*|[^/]*\.test\.[^/]*)$/.test(file.path), "Package contains a private or test file");
    }
  }
  const tarball = path.join(packDirectory, packed.filename);
  await writeFile(path.join(temporary, "package.json"), JSON.stringify({ private: true, type: "module" }));
  const userconfig = path.join(temporary, "empty.npmrc");
  await writeFile(userconfig, "registry=https://registry.npmjs.org/\n");
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--userconfig", userconfig, tarball], { cwd: temporary });

  const installed = path.join(temporary, "node_modules/@lastehr/mcp");
  const installedManifest = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));
  assert.equal(installedManifest.version, manifest.version);
  const api = await import(pathToFileURL(path.join(installed, "dist/index.js")).href);
  assert.equal(typeof api.createRemoteMcpHandler, "function", "Packed package must include HTTP transport exports");

  const bin = path.join(temporary, "node_modules/.bin/lastehr-mcp");
  const cleanEnv = { PATH: process.env.PATH, HOME: temporary, SYSTEMROOT: process.env.SYSTEMROOT };
  const invoke = cliArgs => run(process.execPath, [bin, ...cliArgs], { cwd: temporary, env: cleanEnv, timeout: 15_000 });
  const invokedVersion = (await invoke(["--version"])).stdout.trim();
  assert.equal(invokedVersion, manifest.version);
  assert((await invoke(["--help"])).stdout.includes("doctor --connect"));
  const invokedPackage = `@lastehr/mcp@${invokedVersion}`;
  for (const client of ["json", "cursor"]) {
    const config = JSON.parse((await invoke(["init", "--client", client])).stdout);
    assert.equal(config.mcpServers.lastehr.command, "npx");
    assert.deepEqual(config.mcpServers.lastehr.args, ["-y", invokedPackage], `${client} config must pin the invoked package version`);
    assert(!config.mcpServers.lastehr.env.LASTEHR_MCP_WRITES);
    if (client === "cursor") assert.equal(config.mcpServers.lastehr.type, "stdio");
  }
  const claude = (await invoke(["init", "--client", "claude-code"])).stdout;
  assert.equal(claude.split("\n").find(line => line.startsWith("claude mcp add ")), `claude mcp add lastehr -- npx -y ${invokedPackage}`, "Claude Code registration must pin the invoked package version");

  await new Promise((resolve, reject) => { fixture.once("error", reject); fixture.listen(0, "127.0.0.1", resolve); });
  const baseUrl = `http://127.0.0.1:${fixture.address().port}/fhir`;
  const backendEnv = { ...cleanEnv, FHIR_BACKEND: "hapi", FHIR_BASE_URL: baseUrl };
  const doctor = await run(process.execPath, [bin, "doctor", "--connect"], { cwd: temporary, env: backendEnv, timeout: 15_000 });
  assert.equal(doctor.stdout, "", "Diagnostics must not occupy MCP stdout");

  async function checkClient(approvalCapable, writesEnabled) {
    const client = new Client({ name: "lastehr-package-check", version: "1.0.0" }, { capabilities: approvalCapable ? { elicitation: {} } : {} });
    const transport = new StdioClientTransport({
      command: process.execPath, args: [bin], cwd: temporary, stderr: "pipe",
      env: Object.fromEntries(Object.entries({ ...backendEnv, ...(writesEnabled ? { LASTEHR_MCP_WRITES: "proposal" } : {}) }).filter(([, value]) => value !== undefined)),
    });
    try {
      await client.connect(transport, { timeout: 10_000 });
      assert.equal(client.getServerVersion().version, manifest.version);
      const tools = (await client.listTools()).tools;
      const reads = tools.filter(tool => tool.annotations?.readOnlyHint);
      assert.equal(reads.length, 4);
      assert.equal(tools.length, approvalCapable && writesEnabled ? 8 : 4);
      const result = await client.callTool({ name: "search_patients", arguments: { name: "PackageSmoke" } }, undefined, { timeout: 10_000 });
      assert(!result.isError);
      const patients = JSON.parse(result.content.find(part => part.type === "text").text).patients;
      assert.equal(patients[0].id, "package-smoke-fixture");
    } finally {
      await client.close();
      await transport.close();
    }
  }
  await checkClient(false, false);
  await checkClient(false, true);
  await checkClient(true, true);
  assert(requestMethods.length > 0 && requestMethods.every(method => method === "GET"));
  await writeFile(path.join(packDirectory, "verified.json"), JSON.stringify({
    name: manifest.name, version: manifest.version, filename: packed.filename,
    integrity: packed.integrity, shasum: packed.shasum,
    source: args.includes("--published") ? "npm" : "workspace",
    checks: ["isolated installation", "CLI bin", "client config", "exact-version client pinning", "remote exports", "read-only doctor", "MCP read", "approval capability gate"],
  }, null, 2) + "\n");
  console.log(`Verified ${manifest.name}@${manifest.version}: isolated install, CLI, read-only connectivity, 4 reads and capability-gated proposals.`);
  console.log(`Tarball: artifacts/mcp-release/${packed.filename}`);
} finally {
  await new Promise(resolve => { fixture.close(resolve); fixture.closeAllConnections(); });
  await rm(temporary, { recursive: true, force: true });
}
