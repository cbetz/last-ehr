import type { BenchAdapter, BenchSession } from "./adapter.js";
import { createLastehrMemoryAdapter } from "./adapters/lastehr-memory.js";
import { runModelAgent, modelCredentials, systemPromptSha256, type ModelCredentials } from "./agents/model.js";
import { runScripted } from "./agents/scripted.js";
import { createReviewer, evaluateScenario } from "./checks.js";
import { sanitizeMessage } from "./json.js";
import { SCENARIOS } from "./scenarios.js";
import type { CheckResult, RunRecord, Scenario, ScenarioResult } from "./types.js";
import {
  BENCHMARK_ID,
  BENCHMARK_VERSION,
  NOT_MEASURED,
  REPORT_SCHEMA_VERSION,
} from "./types.js";

export type AgentKind = "scripted" | "model";

export type BenchReport = {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  benchmark: typeof BENCHMARK_ID;
  benchmarkVersion: typeof BENCHMARK_VERSION;
  adapter: string;
  agent: AgentKind;
  model?: string;
  systemPromptSha256?: string;
  data: "synthetic-fixtures-only";
  notMeasured: readonly string[];
  generatedAt: string;
  summary: { pass: number; fail: number; total: number };
  scenarios: ScenarioResult[];
};

export type RunBenchOptions = {
  agent?: AgentKind;
  adapterId?: string;
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

function resolveAdapter(options: RunBenchOptions): BenchAdapter {
  if (options.adapter) return options.adapter;
  const id = options.adapterId ?? "lastehr-memory";
  if (id !== "lastehr-memory") {
    throw new Error(
      `No adapter named "${id}". The seam is BenchAdapter in bench/src/adapter.ts. This package ships lastehr-memory only.`,
    );
  }
  return createLastehrMemoryAdapter();
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

async function runOne(
  scenario: Scenario,
  adapter: BenchAdapter,
  agent: AgentKind,
  credentials: ModelCredentials | undefined,
): Promise<ScenarioResult> {
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
      tools: tools.map((tool) => tool.name),
      calls,
      baseline,
      final: finalSnapshot,
      ...(reviewerError ? { reviewerError } : {}),
    };
    const checks: CheckResult[] = evaluateScenario(scenario, run);
    if (agentError) {
      checks.unshift({ id: "agent", status: "fail", detail: agentError });
    }
    const status = checks.some((item) => item.status === "fail") ? "fail" : "pass";
    return {
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      status,
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

export async function runBench(options: RunBenchOptions = {}): Promise<BenchReport> {
  const agent = options.agent ?? "scripted";
  const env = options.env ?? process.env;
  const credentials = agent === "model" ? modelCredentials(env) : undefined;
  if (agent === "model" && !credentials) {
    throw new Error(
      "No model key. Set BENCH_MODEL_API_KEY or OPENAI_API_KEY, or run with --agent scripted.",
    );
  }
  const adapter = resolveAdapter(options);
  const scenarios = selectScenarios(options.scenarioIds);
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runOne(scenario, adapter, agent, credentials));
  }
  const pass = results.filter((result) => result.status === "pass").length;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    benchmark: BENCHMARK_ID,
    benchmarkVersion: BENCHMARK_VERSION,
    adapter: adapter.id,
    agent,
    ...(credentials ? { model: credentials.model, systemPromptSha256: systemPromptSha256() } : {}),
    data: "synthetic-fixtures-only",
    notMeasured: NOT_MEASURED,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    summary: { pass, fail: results.length - pass, total: results.length },
    scenarios: results,
  };
}
