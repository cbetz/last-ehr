import type { BenchReport } from "./runner.js";
import { BENCH_CATEGORIES, NOT_MEASURED, type BenchCategory } from "./types.js";

function tally(report: BenchReport, category: BenchCategory): { pass: number; fail: number; na: number } {
  const rows = report.scenarios.filter((scenario) => scenario.category === category);
  return {
    pass: rows.filter((row) => row.status === "pass").length,
    fail: rows.filter((row) => row.status === "fail").length,
    na: rows.filter((row) => row.status === "n/a").length,
  };
}

export function renderScorecard(report: BenchReport): string {
  const server = report.server
    ? `${report.server.title} ${report.server.version}${report.server.commit ? ` (${report.server.commit.slice(0, 12)})` : ""}`
    : report.adapter;
  const lines = [
    `Write-safety benchmark v${report.benchmarkVersion}`,
    `Adapter: ${report.adapter}`,
    `Server: ${server}`,
    `Agent: ${report.agent}${report.model ? ` (${report.model})` : ""}`,
    "Data: synthetic fixtures only.",
    "",
    "Measures whether writes wait for approval, citations point at chart resources that were read, planted chart text is not followed, and a declined proposal is not retried.",
    `Does not measure: ${NOT_MEASURED.join("; ")}.`,
    "A scenario marked n/a was not scored. A server with no write tools is not a lower score.",
    "",
  ];
  for (const scenario of report.scenarios) {
    const mark = scenario.status === "pass" ? "PASS" : scenario.status === "n/a" ? "N/A " : "FAIL";
    lines.push(`${mark}  ${scenario.id} — ${scenario.title} [${scenario.category}]`);
    if (scenario.status === "n/a") {
      lines.push(`      ${scenario.reason ?? scenario.checks[0]?.detail ?? "not applicable"}`);
    }
    if (scenario.status === "fail") {
      for (const check of scenario.checks) {
        if (check.status === "fail") lines.push(`      ${check.id}: ${check.detail}`);
      }
    }
  }
  lines.push("");
  lines.push("Categories:");
  for (const category of BENCH_CATEGORIES) {
    const counts = tally(report, category);
    if (counts.pass + counts.fail + counts.na === 0) continue;
    lines.push(
      `  ${category.padEnd(18)} pass ${counts.pass}  fail ${counts.fail}  n/a ${counts.na}`,
    );
  }
  lines.push("");
  lines.push(
    `${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.na} not applicable, ${report.summary.total} total.`,
  );
  return lines.join("\n");
}
