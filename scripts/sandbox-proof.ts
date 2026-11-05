import { pathToFileURL } from "node:url";

import { loadMcpConfig, McpConfigurationError } from "../packages/mcp/src/config.js";
import { createSandboxClient } from "../packages/mcp/src/sandbox-client.js";
import {
  createWriteTools,
  writeToolOptionsFromConfig,
} from "../packages/mcp/src/write-tools.js";

export type SandboxProofResult = {
  exitCode: number;
  transcript: string;
};

/**
 * One approval-gated Observation write and its read-back, for a README or
 * demo transcript. Credentials come from the environment only. The
 * transcript does not include keys or tokens.
 */
export async function runSandboxProof(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<SandboxProofResult> {
  const backend = env.LASTEHR_BACKEND?.trim();
  if (backend !== "epic" && backend !== "oracle") {
    return {
      exitCode: 1,
      transcript:
        "Set LASTEHR_BACKEND=epic or oracle, plus LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1 and the SMART env vars. No secret was read.\n",
    };
  }
  const patientId = env.LASTEHR_PATIENT_ID?.trim();
  if (!patientId || !/^[A-Za-z0-9\-.]{1,128}$/.test(patientId)) {
    return {
      exitCode: 1,
      transcript:
        "Set LASTEHR_PATIENT_ID to the sandbox Patient id. No secret was read.\n",
    };
  }
  let config;
  try {
    config = loadMcpConfig(env);
  } catch (error) {
    const message =
      error instanceof McpConfigurationError
        ? error.message
        : "Sandbox proof configuration is invalid. Values were withheld.";
    return { exitCode: 1, transcript: `${message}\n` };
  }
  if (!config.sandbox) {
    return {
      exitCode: 1,
      transcript: "Sandbox proof requires LASTEHR_BACKEND=epic or oracle.\n",
    };
  }
  const client = createSandboxClient(config.sandbox, fetchFn);
  const shown: string[] = [];
  const tools = createWriteTools(
    client,
    async (request) => {
      shown.push(request.title, request.summary, "Decision: approved");
      return "approved";
    },
    writeToolOptionsFromConfig(config),
  );
  const tool = tools.find((candidate) => candidate.name === "record_observation");
  if (!tool) {
    return { exitCode: 1, transcript: "record_observation is not available.\n" };
  }
  const input =
    backend === "epic"
      ? { patientId, label: "Heart rate", value: 72, unit: "bpm" }
      : { patientId, label: "oral temperature", value: 37, unit: "Cel" };
  const result = (await tool.execute(input)) as {
    saved?: boolean;
    id?: string;
    outcome?: string;
    readBack?: { matched?: boolean; diff?: string };
  };
  const lines = [
    `Last EHR sandbox proof — ${backend}`,
    `Patient: Patient/${patientId}`,
    ...shown,
  ];
  if (!result.saved || !result.id) {
    lines.push(result.outcome ?? "The write was not saved.");
    return { exitCode: 1, transcript: `${lines.join("\n")}\n` };
  }
  lines.push(`Saved: Observation/${result.id}`);
  if (result.readBack?.diff) {
    lines.push("Read-back:", result.readBack.diff.slice(0, 2000));
  } else {
    lines.push("Read-back: not available.");
  }
  lines.push(
    "The sandbox does not support delete. This observation persists. This is not a clinical or compliance claim.",
  );
  return { exitCode: 0, transcript: `${lines.join("\n")}\n` };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runSandboxProof()
    .then((result) => {
      process.stdout.write(result.transcript);
      process.exitCode = result.exitCode;
    })
    .catch(() => {
      process.stderr.write("Sandbox proof failed. No credential was printed.\n");
      process.exitCode = 1;
    });
}
