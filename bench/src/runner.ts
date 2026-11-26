import { resolve } from "node:path";

import type { BenchAdapter, BenchSession } from "./adapter.js";
import { createLastehrMemoryAdapter } from "./adapters/lastehr-memory.js";
import { createStdioAdapter } from "./adapters/stdio-mcp.js";
import { applicability } from "./applicability.js";
import { defaultContract, type ServerContract } from "./contract.js";
import { runModelAgent, modelCredentials, systemPromptSha256, type ModelCredentials } from "./agents/model.js";
import { runScripted } from "./agents/scripted.js";
import { createReviewer, evaluateScenario } from "./checks.js";
import { sanitizeMessage } from "./json.js";
import { resolveLaunch } from "./prepare.js";
import { runProbe } from "./probe.js";
import type { BenchReport, ServerInfo } from "./report.js";
import { SCENARIOS } from "./scenarios.js";
import { loadServerConfig } from "./server-config.js";
import type { CheckResult, RunRecord, Scenario, ScenarioResult } from "./types.js";
import {
  BENCHMARK_ID,
  BENCHMARK_VERSION,
  NOT_MEASURED,
  REPORT_SCHEMA_VERSION,
  type AgentKind,
} from "./types.js";

export type { AgentKind, BenchReport, ServerInfo };

export type RunBenchOptions = {
  agent?: AgentKind;
  adapterId?: string;
  configPath?: string;
  fhirBaseUrl?: string;
  repoRoot?: string;
  probe?: boolean;
  scenarioIds?: string[];
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  adapter?: BenchAdapter;
};

function selectScenarios(ids: string[] | undefined): Scenario[] {
  if (!ids || ids.length === 0) return [...SCENARIOS];
  const chosen: Scenario[] = [];
  for (const id of ids) {
    const scenario = SCENARIOS.find((item) => item.id === id);
    if (!scenario) throw new Error(`Unknown scenario "${id}". Run with --help to list ids.`);
    chosen.push(scenario);
  }
  return chosen;
}

async function resolveAdapter(options: RunBenchOptions): Promise<BenchAdapter> {
  if (options.adapter) return options.adapter;
  const id = options.adapterId ?? (options.configPath ? undefined : "lastehr-memory");
  if (!options.configPath && (id === undefined || id === "lastehr-memory")) {
    return createLastehrMemoryAdapter();
  }
  const config = loadServerConfig(options.configPath ? { path: options.configPath } : { id });
  const repoRoot = options.repoRoot ?? process.cwd();
  const launch = await resolveLaunch(config, {
    repoRoot,
    ...(options.fhirBaseUrl ? { fhirBaseUrl: options.fhirBaseUrl } : {}),
    cacheRoot: resolve(repoRoot, "bench/.cache"),
  });
  return createStdioAdapter(config, launch);
}

function notApplicable(scenario: Scenario, reason: string): ScenarioResult {
  return {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    status: "n/a",
    reason,
    checks: [{ id: "applicability", status: "n/a", detail: reason }],
  };
}

function failed(scenario: Scenario, detail: string): ScenarioResult {
  return {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    status: "fail",
    checks: [{ id: "runner", status: "fail", detail }],
  };
}

function scenarioStatus(checks: CheckResult[]): ScenarioResult["status"] {
  if (checks.some((item) => item.status === "fail")) return "fail";
  if (checks.some((item) => item.status === "pass")) return "pass";
  return "n/a";
}

async function runOne(
  scenario: Scenario,
  adapter: BenchAdapter,
  agent: AgentKind,
  credentials: ModelCredentials | undefined,
  contract: ServerContract,
): Promise<ScenarioResult> {
  const decision = applicability({
    scenario,
    agent,
    contract,
    writeTools: adapter.writeToolNames,
  });
  if (!decision.ok) return notApplicable(scenario, decision.reason);

  let session: BenchSession | undefined;
  try {
    const reviewer = createReviewer(scenario, () => {
      if (!session) throw new Error("reviewer ran before the session was ready");
      return session;
    });
    session = await adapter.start({
      elicitation: scenario.elicitation !== false,
      plants: scenario.plants ?? [],
      reviewer,
    });
    const baseline = await session.snapshot();
    const tools = await session.listTools();
    const calls: RunRecord["calls"] = [];
    const callTool = async (name: string, args: Record<string, unknown>) => {
      const result = await session!.callTool(name, args);
      calls.push(result);
      return result;
    };
    let agentError: string | undefined;
    try {
      if (agent === "scripted") {
        await runScripted(scenario.scripted, callTool);
      } else if (agent === "probe") {
        throw new Error("probe does not run scenario instructions");
      } else if (!credentials) {
        throw new Error("model credentials missing");
      } else {
        await runModelAgent({
          instruction: scenario.instruction,
          tools,
          callTool,
          credentials,
        });
      }
    } catch (error) {
      agentError = sanitizeMessage(error);
    }
    const finalSnapshot = await session.snapshot();
    const reviewerError = session.takeReviewerError();
    const run: RunRecord = {
      writeToolNames: adapter.writeToolNames,
      ...(adapter.readToolNames ? { readToolNames: adapter.readToolNames } : {}),
      tools: tools.map((tool) => tool.name),
      calls,
      baseline,
      final: finalSnapshot,
      ...(reviewerError ? { reviewerError } : {}),
    };
    const checks: CheckResult[] = evaluateScenario(scenario, run, contract);
    if (agentError) {
      checks.unshift({ id: "agent", status: "fail", detail: agentError });
    }
    return {
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      status: scenarioStatus(checks),
      checks,
    };
  } catch (error) {
    return failed(scenario, sanitizeMessage(error));
  } finally {
    if (session) {
      try {
        await session.close();
      } catch {
        // The score is already decided. A transport close error is not a chart write.
      }
    }
  }
}

function summarize(results: ScenarioResult[]): BenchReport["summary"] {
  const pass = results.filter((result) => result.status === "pass").length;
  const fail = results.filter((result) => result.status === "fail").length;
  const na = results.filter((result) => result.status === "n/a").length;
  return { pass, fail, na, total: results.length };
}

export async function runBench(options: RunBenchOptions = {}): Promise<BenchReport> {
  const agent = options.probe ? "probe" : (options.agent ?? "scripted");
  const env = options.env ?? process.env;
  const credentials = agent === "model" ? modelCredentials(env) : undefined;
  if (agent === "model" && !credentials) {
    throw new Error(
      "No model key. Set BENCH_MODEL_API_KEY or OPENAI_API_KEY, or run with --agent scripted.",
    );
  }
  const adapter = await resolveAdapter(options);
  const now = options.now ?? (() => new Date());
  if (agent === "probe") {
    const report = await runProbe(adapter, now);
    return report;
  }
  const contract = adapter.contract ?? defaultContract();
  const scenarios = selectScenarios(options.scenarioIds);
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runOne(scenario, adapter, agent, credentials, contract));
  }
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    benchmark: BENCHMARK_ID,
    benchmarkVersion: BENCHMARK_VERSION,
    adapter: adapter.id,
    agent,
    ...(credentials ? { model: credentials.model, systemPromptSha256: systemPromptSha256() } : {}),
    ...(adapter.server ? { server: adapter.server } : {}),
    ...(adapter.reproduce ? { reproduce: [...adapter.reproduce] } : {}),
    data: "synthetic-fixtures-only",
    notMeasured: NOT_MEASURED,
    generatedAt: now().toISOString(),
    summary: summarize(results),
    scenarios: results,
  };
}
