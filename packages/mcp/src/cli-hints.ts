/**
 * Pointers for a person running `init` or `doctor` at a terminal.
 *
 * `init` stdout is piped configuration, and the stdio MCP server speaks
 * JSON-RPC on stdout. These lines go to stderr, and only when a terminal
 * is attached and `LASTEHR_QUIET` is not `1`. The server path does not
 * call this module.
 */

const DOCS_URL = "https://www.lastehr.com/docs/mcp";
const REPO_URL = "https://github.com/cbetz/last-ehr";
const ISSUES_URL = "https://github.com/cbetz/last-ehr/issues";

const REPO_LINE =
  `Source, issues, and adapter requests: ${REPO_URL} (a star helps others find it).`;

export function initNextSteps(): string {
  return [
    "Next: run `npx @lastehr/mcp doctor` to check the connection.",
    `Docs: ${DOCS_URL}`,
    REPO_LINE,
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
): void {
  writeHint(initNextSteps(), env, stderr);
}

export function writeDoctorNextStep(
  ok: boolean,
  env: NodeJS.ProcessEnv,
  stderr: HintStream = process.stderr,
): void {
  writeHint(doctorNextStep(ok), env, stderr);
}
