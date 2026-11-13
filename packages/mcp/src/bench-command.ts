import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `bench` is a repository command. The published npm package does not
 * contain the scenario catalog; a checkout runs it via tsx.
 */
export function benchUnavailableMessage(): string {
  return [
    "The write-safety benchmark ships in the last-ehr git checkout, not in this npm package.",
    "From a checkout: npm run bench",
    "It scores write-safety and protocol behavior on synthetic charts. It does not score clinical correctness.",
  ].join("\n");
}

export function findBenchCli(startDir: string): { repoRoot: string; entry: string } | undefined {
  let dir = resolve(startDir);
  for (let depth = 0; depth < 6; depth += 1) {
    const entry = join(dir, "bench", "src", "cli.ts");
    if (existsSync(entry) && existsSync(join(dir, "package.json"))) {
      return { repoRoot: dir, entry };
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

function spawnBench(repoRoot: string, entry: string, args: string[]): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], {
      cwd: repoRoot,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}

export async function runBenchCommand(
  args: string[],
  options?: { startDir?: string },
): Promise<void> {
  const startDir = options?.startDir ?? dirname(fileURLToPath(import.meta.url));
  const found = findBenchCli(startDir);
  if (!found) {
    console.error(benchUnavailableMessage());
    process.exitCode = 1;
    return;
  }
  try {
    process.exitCode = await spawnBench(found.repoRoot, found.entry, args);
  } catch {
    console.error("Could not start the benchmark runner.");
    process.exitCode = 1;
  }
}
