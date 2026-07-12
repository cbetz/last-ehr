import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HapiBackend } from "@/lib/fhir/hapi";
import { runFhirAgentSafetyEval } from "@/lib/eval/fhir-agent-safety";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const localHapiUrl = "http://127.0.0.1:8080/fhir";
const defaultReport = ".lastehr/fhir-agent-safety-eval.json";

type EvalArguments = {
  prepare: boolean;
  report: string;
};

function help(): string {
  return [
    "Last EHR FHIR Agent Safety Eval — synthetic workflow mechanics only",
    "",
    "Usage:",
    "  npm run eval",
    "  npm run eval -- --no-prepare --report artifacts/fhir-agent-safety-eval.json",
    "",
    "The default command starts the loopback HAPI stack and resets synthetic data.",
    "It creates and deletes its own disposable test charts, then writes a scrubbed JSON report.",
  ].join("\n");
}

function parseArguments(args: string[]): EvalArguments {
  let prepare = true;
  let report = defaultReport;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--no-prepare") {
      prepare = false;
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

  return { prepare, report };
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

  const { prepare, report: reportPath } = parseArguments(args);
  if (prepare) {
    await run(npm, ["run", "demo:local:prepare"]);
  }

  const report = await runFhirAgentSafetyEval({
    confirmSyntheticTarget: true,
    createBackend: () => new HapiBackend(localHapiUrl),
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
