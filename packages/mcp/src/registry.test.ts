import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MCP_SERVER_VERSION } from "./server.js";

type RegistryServer = {
  $schema: string;
  name: string;
  version: string;
  packages: Array<{
    registryType: string;
    identifier: string;
    version: string;
    transport: { type: string };
  }>;
};

type PackageManifest = {
  mcpName: string;
  name: string;
  version: string;
};

function readJson<T>(file: string): T {
  return JSON.parse(
    readFileSync(new URL(file, import.meta.url), "utf8"),
  ) as T;
}

describe("MCP Registry metadata", () => {
  it("matches the npm package identity and release version", () => {
    const manifest = readJson<PackageManifest>("../package.json");
    const server = readJson<RegistryServer>("../server.json");

    expect(server.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
    expect(server.name).toBe("io.github.cbetz/last-ehr");
    expect(server.name).toBe(manifest.mcpName);
    expect(server.version).toBe("0.5.1");
    expect(server.version).toBe(manifest.version);
    expect(MCP_SERVER_VERSION).toBe(manifest.version);
    expect(server.packages).toContainEqual(
      expect.objectContaining({
        registryType: "npm",
        identifier: manifest.name,
        version: manifest.version,
        transport: { type: "stdio" },
      }),
    );
  });
});
