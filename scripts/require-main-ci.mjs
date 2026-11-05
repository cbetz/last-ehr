import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Classify CI workflow runs for one main SHA.
 * publish=true must not treat an in-progress run as a missing success.
 * @param {unknown} runs
 * @param {string | undefined} sha
 */
export function classifyMainCi(runs, sha) {
  const mine = Array.isArray(runs)
    ? runs.filter(
        (run) =>
          run &&
          run.head_sha === sha &&
          run.head_branch === "main" &&
          run.event === "push",
      )
    : [];
  const success = mine.find(
    (run) => run.status === "completed" && run.conclusion === "success",
  );
  if (success) return { state: "success", run: success };
  const pending = mine.find((run) => run.status !== "completed");
  if (pending) return { state: "pending", run: pending };
  const finished = mine.find((run) => run.status === "completed");
  if (finished) return { state: "failed", run: finished };
  return { state: "missing" };
}

function readRuns(file) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(parsed?.workflow_runs) ? parsed.workflow_runs : [];
}

function urlOf(run) {
  return typeof run?.html_url === "string" ? run.html_url : "(no url)";
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/require-main-ci.mjs <workflow-runs.json>");
    process.exit(1);
  }
  const result = classifyMainCi(readRuns(file), process.env.GITHUB_SHA);
  if (result.state === "success") {
    const line = `Verified main CI: ${urlOf(result.run)}`;
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n\n`);
    }
    process.exit(0);
  }
  if (result.state === "pending") {
    console.log(`Main CI is still ${result.run.status}: ${urlOf(result.run)}`);
    process.exit(10);
  }
  if (result.state === "failed") {
    console.error(
      `Main CI completed ${result.run.conclusion ?? "without success"}: ${urlOf(result.run)}`,
    );
    process.exit(1);
  }
  console.error(
    "Publishing requires completed, successful CI on this exact main SHA. No push run was found.",
  );
  process.exit(1);
}
