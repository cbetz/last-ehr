/**
 * Pointers for a person running `init` or `doctor` at a terminal.
 *
 * `init` stdout is piped configuration, including `--client json`, and the
 * stdio MCP server speaks JSON-RPC on stdout. Init next steps go to stderr
 * once, after a successful init, and only when both streams are terminals,
 * `LASTEHR_QUIET` is not `1`, and `CI` is not set. The server path does not
 * call this module. Nothing here makes a network call.
 */

const REPO_URL = "https://github.com/cbetz/last-ehr";
const ISSUES_URL = "https://github.com/cbetz/last-ehr/issues";

const REPO_LINE =
  `Source, issues, and adapter requests: ${REPO_URL} (a star helps others find it).`;

export function initNextSteps(): string {
  return [
    "Next steps:",
    'Read: "Search for synthetic patient Maria Garcia and show her chart." init --demo seeds her.',
    'Write: "Propose a note that says this chart was reviewed."',
    "The client asks you to approve it before anything is saved. init --demo sets `LASTEHR_MCP_WRITES=proposal`.",
    `Issues, benchmark, and roadmap: ${REPO_URL} (a star helps other people find it).`,
    `Issues: ${ISSUES_URL}`,
    "",
  ].join("\n");
}

export function doctorNextStep(ok: boolean): string {
  const line = ok ? REPO_LINE : `Report this problem: ${ISSUES_URL}`;
  return `${line}\n`;
}

type HintStream = {
  isTTY?: boolean;
  write: (chunk: string) => unknown;
};

function hintsEnabled(
  env: NodeJS.ProcessEnv,
  stderr: { isTTY?: boolean },
): boolean {
  return env.LASTEHR_QUIET !== "1" && stderr.isTTY === true;
}

/**
 * `CI=true` and `CI=1` are the values GitHub Actions and other runners set.
 * `CI=false` and `CI=0` stay interactive so a person can force the block on.
 */
function ciDisablesHints(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI;
  return typeof value === "string" && value !== "" && value !== "false" && value !== "0";
}

function writeHint(
  text: string,
  env: NodeJS.ProcessEnv,
  stderr: HintStream,
): void {
  if (!hintsEnabled(env, stderr)) return;
  stderr.write(text);
}

export function writeInitNextSteps(
  env: NodeJS.ProcessEnv,
  stderr: HintStream = process.stderr,
  stdout: { isTTY?: boolean } = process.stdout,
): void {
  if (ciDisablesHints(env) || stdout.isTTY !== true) return;
  writeHint(initNextSteps(), env, stderr);
}

export function writeDoctorNextStep(
  ok: boolean,
  env: NodeJS.ProcessEnv,
  stderr: HintStream = process.stderr,
): void {
  writeHint(doctorNextStep(ok), env, stderr);
}
