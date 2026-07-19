#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createStdioConnector } from "./harness.js";
import { parseManifest } from "./manifest.js";
import { createRestProbe } from "./probe.js";
import { runConformance } from "./run.js";

function argValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  // A flag directly followed by another flag has no value; treating the
  // next flag as one would silently misconfigure the run.
  return value && !value.startsWith("--") ? value : undefined;
}

const SUITE_VERSION = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;

const HELP = `Approval-Gated Agent Writes on FHIR — conformance suite (spec v0.1 draft)

Usage:
  awp-conformance --server "<command>" --manifest <awp-manifest.json> \\
    --fhir-base-url <url> --confirm-synthetic [--report <path>]

  --server           Shell command that starts the MCP stdio server under
                     test (spawned fresh for every scenario).
  --manifest         Path to the implementer-supplied manifest declaring
                     each write tool's name, argument template, and where
                     its write lands. See examples/ in this package.
  --fhir-base-url    Base URL of the SAME FHIR store the server writes to;
                     the suite verifies side effects with its own reads.
                     Bearer auth: set AWP_FHIR_BEARER_TOKEN in the env.
  --confirm-synthetic  Required. The target must be a disposable synthetic
                     store: the suite creates and deletes resources.
  --report           Write the JSON report here (default: stdout only).

Passing proves gate mechanics against this suite's scripted reviewer. It
does not prove clinical correctness, prompt-injection immunity, or
authorization, and several spec requirements are attestation-only — see
the attestations block in the report.
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.length === 0) {
    process.stdout.write(HELP);
    return;
  }
  const server = argValue(argv, "--server");
  const manifestPath = argValue(argv, "--manifest");
  const fhirBaseUrl = argValue(argv, "--fhir-base-url");
  const reportPath = argValue(argv, "--report");
  if (!server || !manifestPath || !fhirBaseUrl) {
    process.stderr.write(HELP);
    process.exitCode = 2;
    return;
  }
  if (!argv.includes("--confirm-synthetic")) {
    process.stderr.write(
      "Refusing to run: pass --confirm-synthetic to state that the FHIR target is disposable and synthetic. The suite creates and deletes resources.\n",
    );
    process.exitCode = 2;
    return;
  }

  const manifest = parseManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  );
  const report = await runConformance({
    confirmSyntheticTarget: true,
    connector: createStdioConnector(server),
    probe: createRestProbe(fhirBaseUrl, {
      bearerToken: process.env.AWP_FHIR_BEARER_TOKEN,
    }),
    manifest,
    suiteVersion: SUITE_VERSION,
  });

  for (const check of report.checks) {
    const marker =
      check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : "–";
    process.stdout.write(
      `${marker} ${check.id} [${check.level}] ${check.status}\n`,
    );
  }
  process.stdout.write(`\nstatus: ${report.status}\n`);
  const serialized = JSON.stringify(report, null, 2);
  if (reportPath) {
    writeFileSync(reportPath, serialized);
    process.stdout.write(`report: ${reportPath}\n`);
  } else {
    process.stdout.write(`${serialized}\n`);
  }
  if (report.status !== "pass") process.exitCode = 1;
}

main().catch((error) => {
  // Terminal-only; the report itself never carries error text.
  process.stderr.write(
    `awp-conformance failed: ${
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
