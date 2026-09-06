import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./remote-server.js", () => ({
  startRemoteMcpServer: vi.fn(async () => ({})),
}));
vi.mock("./server.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./server.js")>();
  return { ...actual, startMcpServer: vi.fn(async () => ({})) };
});

import { runCli } from "./cli.js";
import { startRemoteMcpServer } from "./remote-server.js";
import { MCP_SERVER_VERSION, startMcpServer } from "./server.js";

// The metadata flags read no configuration, so an empty env is the point. Cast
// because this repo's ProcessEnv requires NODE_ENV, and the package's own build
// excludes test files so `tsc -p tsconfig.build.json` never sees this file.
const EMPTY_ENV = {} as NodeJS.ProcessEnv;

describe("MCP CLI metadata flags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["--version", "-v"])("prints the package version for %s", async (flag) => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCli([flag], EMPTY_ENV);

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(`${MCP_SERVER_VERSION}\n`);
  });

  it("documents the version flag in help", async () => {
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await runCli(["--help"], EMPTY_ENV);

    expect(write.mock.calls[0]?.[0]).toContain("@lastehr/mcp --version");
  });
});

describe("MCP CLI transport dispatch", () => {
  const HTTP_ENV = {
    LASTEHR_MCP_TRANSPORT: "http",
    LASTEHR_MCP_RESOURCE: "https://mcp.example.test/mcp",
    LASTEHR_MCP_OAUTH_ISSUER: "https://auth.example.test/",
    LASTEHR_MCP_OAUTH_JWKS_URI: "https://auth.example.test/.well-known/jwks.json",
    LASTEHR_MCP_EXCHANGE_CLIENT_ID: "client-with-idp",
    LASTEHR_MCP_TOKEN_ENDPOINT: "https://fhir.example.test/oauth2/token",
  } as unknown as NodeJS.ProcessEnv;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("serve dispatches LASTEHR_MCP_TRANSPORT=http to the remote server and never starts stdio", async () => {
    await runCli(["serve"], HTTP_ENV);
    expect(startRemoteMcpServer).toHaveBeenCalledOnce();
    expect(vi.mocked(startRemoteMcpServer).mock.calls[0][0].config).toMatchObject({
      transport: "http",
    });
    expect(startMcpServer).not.toHaveBeenCalled();
  });

  it("serve without the flag still starts the stdio server and never the remote one", async () => {
    await runCli(["serve"], { MEDPLUM_ACCESS_TOKEN: "t" } as unknown as NodeJS.ProcessEnv);
    expect(startMcpServer).toHaveBeenCalledOnce();
    expect(startRemoteMcpServer).not.toHaveBeenCalled();
  });

  it("doctor reports per-caller OAuth for an http configuration", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await runCli(["doctor"], HTTP_ENV);
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toContain(
      "per-caller OAuth (token exchange)",
    );
  });
});
