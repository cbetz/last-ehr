import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HapiBackend } from "@/lib/fhir/hapi";
import { FirelyBackend } from "@/lib/fhir/firely";
import type { FhirBackend } from "@/lib/fhir/backend";
import { runFhirAgentSafetyEval } from "@/lib/eval/fhir-agent-safety";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const localHapiUrl = "http://127.0.0.1:8080/fhir";
const defaultReport = ".lastehr/fhir-agent-safety-eval.json";

type EvalArguments = {
  prepare: boolean;
  report: string;
  backend: "hapi" | "firely";
  baseUrl?: string;
  confirmSynthetic: boolean;
};

function help(): string {
  return [
    "Last EHR FHIR Agent Safety Eval — synthetic workflow mechanics only",
    "",
    "Usage:",
    "  npm run eval",
    "  npm run eval -- --no-prepare --report artifacts/fhir-agent-safety-eval.json",
    "  npm run eval -- --backend firely --base-url https://server.fire.ly --confirm-synthetic",
    "",
    "The default command starts the loopback HAPI stack and resets synthetic data.",
    "It creates and deletes its own disposable test charts, then writes a scrubbed JSON report.",
    "",
    "Adapter targets (--backend firely) never prepare the local stack and fail",
    "closed without --confirm-synthetic, because the evaluator creates and",
    "deletes resources on the target. Point it only at a disposable synthetic",
    "sandbox. A bearer token is read from FIRELY_ACCESS_TOKEN when set.",
  ].join("\n");
}

function parseArguments(args: string[]): EvalArguments {
  let prepare = true;
  let report = defaultReport;
  let backend: EvalArguments["backend"] = "hapi";
  let baseUrl: string | undefined;
  let confirmSynthetic = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--no-prepare") {
      prepare = false;
      continue;
    }
    if (arg === "--confirm-synthetic") {
      confirmSynthetic = true;
      continue;
    }
    if (arg === "--backend") {
      const value = args[index + 1];
      if (value !== "hapi" && value !== "firely") {
        throw new Error("--backend must be hapi or firely.");
      }
      backend = value;
      index++;
      continue;
    }
    if (arg === "--base-url") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--base-url requires a URL.");
      }
      baseUrl = value;
      index++;
      continue;
    }
    if (arg === "--report") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--report requires a relative file path.");
      }
      report = value;
      index++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (resolve(repositoryRoot, report) === repositoryRoot) {
    throw new Error("--report must name a file within the repository.");
  }

  if (backend !== "hapi") {
    // The loopback HAPI stack is the only target this script may set up or
    // reset. Adapter targets are the contributor's own disposable sandbox.
    prepare = false;
    if (!baseUrl) {
      throw new Error(`--backend ${backend} requires --base-url.`);
    }
    if (!confirmSynthetic) {
      throw new Error(
        "Adapter targets require --confirm-synthetic: the evaluator creates and deletes resources, so it must only run against a disposable synthetic sandbox.",
      );
    }
  }

  return { prepare, report, backend, baseUrl, confirmSynthetic };
}

function createEvalBackend({ backend, baseUrl }: EvalArguments): FhirBackend {
  if (backend === "firely") {
    if (!baseUrl) {
      throw new Error("--backend firely requires --base-url.");
    }
    return new FirelyBackend(
      baseUrl,
      process.env.FIRELY_ACCESS_TOKEN || undefined,
    );
  }
  return new HapiBackend(baseUrl ?? localHapiUrl);
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(new Error(`Could not start ${command}: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${
            signal ? `signal ${signal}` : `code ${code ?? 1}`
          }.`,
        ),
      );
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h", "help"].includes(args[0])) {
    process.stdout.write(`${help()}\n`);
    return;
  }

  const parsed = parseArguments(args);
  const { prepare, report: reportPath } = parsed;
  if (prepare) {
    await run(npm, ["run", "demo:local:prepare"]);
  }

  const report = await runFhirAgentSafetyEval({
    confirmSyntheticTarget: true,
    createBackend: () => createEvalBackend(parsed),
  });
  const destination = resolve(repositoryRoot, reportPath);
  const relativeDestination = relative(repositoryRoot, destination);

  if (relativeDestination.startsWith("..") || resolve(destination) === repositoryRoot) {
    throw new Error("--report must stay within the repository.");
  }

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const check of report.checks) {
    const marker = check.status === "pass" ? "✓" : check.status === "fail" ? "✕" : "–";
    process.stdout.write(`${marker} ${check.label}\n`);
  }
  process.stdout.write(
    `\nFHIR Agent Safety Eval: ${report.status.toUpperCase()}\nReport: ${relativeDestination}\n`,
  );

  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "FHIR Agent Safety Eval failed.",
  );
  process.exitCode = 1;
});
