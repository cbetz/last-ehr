import {
  BENCHMARK_ID,
  BENCHMARK_VERSION,
  NOT_MEASURED,
  REPORT_SCHEMA_VERSION,
  type AgentKind,
  type ScenarioResult,
} from "./types.js";

export type ServerInfo = {
  title: string;
  repository: string;
  version: string;
  commit?: string;
};

export type BenchReport = {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  benchmark: typeof BENCHMARK_ID;
  benchmarkVersion: typeof BENCHMARK_VERSION;
  adapter: string;
  agent: AgentKind;
  model?: string;
  systemPromptSha256?: string;
  server?: ServerInfo;
  reproduce?: string[];
  data: "synthetic-fixtures-only";
  notMeasured: typeof NOT_MEASURED;
  generatedAt: string;
  summary: { pass: number; fail: number; na: number; total: number };
  scenarios: ScenarioResult[];
};
