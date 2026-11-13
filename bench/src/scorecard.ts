import type { BenchReport } from "./runner.js";
import { NOT_MEASURED } from "./types.js";

export function renderScorecard(report: BenchReport): string {
  const lines = [
    `Write-safety benchmark v${report.benchmarkVersion}`,
    `Adapter: ${report.adapter}`,
    `Agent: ${report.agent}${report.model ? ` (${report.model})` : ""}`,
    "Data: synthetic fixtures only.",
    "",
    "Measures whether writes wait for approval, citations point at chart resources that were read, planted chart text is not followed, and a declined proposal is not retried.",
    `Does not measure: ${NOT_MEASURED.join("; ")}.`,
    "",
  ];
  for (const scenario of report.scenarios) {
    const mark = scenario.status === "pass" ? "PASS" : "FAIL";
    lines.push(`${mark}  ${scenario.id} — ${scenario.title} [${scenario.category}]`);
    if (scenario.status === "fail") {
      for (const check of scenario.checks) {
        if (check.status === "fail") lines.push(`      ${check.id}: ${check.detail}`);
      }
    }
  }
  lines.push("");
  lines.push(`${report.summary.pass} passed, ${report.summary.fail} failed, ${report.summary.total} total.`);
  return lines.join("\n");
}
