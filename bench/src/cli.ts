import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { SCENARIOS } from "./scenarios.js";
import { renderScorecard } from "./scorecard.js";
import { runBench, type AgentKind } from "./runner.js";

function helpText(): string {
  const ids = SCENARIOS.map((scenario) => `  ${scenario.id.padEnd(36)} ${scenario.title}`).join("\n");
  return [
    "Write-safety benchmark for FHIR chart writes through an MCP server.",
    "Synthetic fixtures only. Scores approval, evidence, and protocol behavior.",
    "Does not score clinical correctness or regulatory compliance.",
    "",
    "Usage:",
    "  npm run bench",
    "  npm run bench -- --report bench-results.json --markdown bench-results.md",
    "  npm run bench -- --agent model",
    "  npm run bench -- --scenario note-declined",
    "",
    "Options:",
    "  --agent scripted|model   scripted is the default and needs no API key",
    "  --adapter lastehr-memory only built-in adapter (default)",
    "  --scenario <id>          run one scenario; repeat the flag to run several",
    "  --report <file>          write the JSON results",
    "  --markdown <file>        write the scorecard",
    "",
    "Model agent (optional): set BENCH_MODEL_API_KEY or OPENAI_API_KEY.",
    "BENCH_MODEL_BASE_URL defaults to https://api.openai.com/v1 (chat completions).",
    "BENCH_MODEL defaults to gpt-4.1-mini. The harness answers approval prompts.",
    "",
    "Scenarios:",
    ids,
    "",
  ].join("\n");
}

function flagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function flagValues(argv: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) return [];
    values.push(value);
  }
  return values;
}

export async function execute(
  argv: string[],
  io: { stdout: (text: string) => void; stderr: (text: string) => void } = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(`${helpText()}\n`);
    return 0;
  }
  if (argv.includes("--agent") && !flagValue(argv, "--agent")) {
    io.stderr("`--agent` must be scripted or model.\n");
    return 1;
  }
  const agentFlag = flagValue(argv, "--agent") ?? "scripted";
  if (agentFlag !== "scripted" && agentFlag !== "model") {
    io.stderr("`--agent` must be scripted or model.\n");
    return 1;
  }
  const agent: AgentKind = agentFlag;
  const adapterId = flagValue(argv, "--adapter");
  if (argv.includes("--adapter") && !adapterId) {
    io.stderr("`--adapter` needs a name. The built-in adapter is lastehr-memory.\n");
    return 1;
  }
  const scenarioIds = flagValues(argv, "--scenario");
  if (argv.includes("--scenario") && scenarioIds.length === 0) {
    io.stderr("`--scenario` needs an id. Run with --help to list them.\n");
    return 1;
  }
  const reportPath = flagValue(argv, "--report");
  const markdownPath = flagValue(argv, "--markdown");
  if (argv.includes("--report") && !reportPath) {
    io.stderr("`--report` needs a file path.\n");
    return 1;
  }
  if (argv.includes("--markdown") && !markdownPath) {
    io.stderr("`--markdown` needs a file path.\n");
    return 1;
  }
  const known = new Set([
    "--agent",
    "--adapter",
    "--scenario",
    "--report",
    "--markdown",
    "--help",
    "-h",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--") && token !== "-h") continue;
    if (!known.has(token)) {
      io.stderr(`Unknown option ${token}. Run with --help.\n`);
      return 1;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--") && token !== "--help" && token !== "-h") index += 1;
  }

  try {
    const report = await runBench({
      agent,
      env,
      ...(adapterId ? { adapterId } : {}),
      ...(scenarioIds.length > 0 ? { scenarioIds } : {}),
    });
    const card = renderScorecard(report);
    io.stdout(`${card}\n`);
    if (reportPath) {
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    if (markdownPath) {
      await mkdir(dirname(markdownPath), { recursive: true });
      await writeFile(markdownPath, `${card}\n`);
    }
    return report.summary.fail === 0 ? 0 : 1;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : "The benchmark could not start."}\n`);
    return 1;
  }
}

function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (isEntryPoint()) {
  execute(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
