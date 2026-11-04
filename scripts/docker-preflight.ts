import { spawn } from "node:child_process";

/**
 * Shown when `docker info` can start but the daemon is not accepting
 * connections. A missing `docker` binary is a different failure: callers leave
 * that to the existing `spawn` error path (`Could not start docker: ...`).
 */
export const DOCKER_NOT_RUNNING_MESSAGE =
  "Docker does not appear to be running. Start Docker Desktop (or your Docker daemon) and re-run this command.";

export type DockerDaemonStatus = "running" | "not-running" | "missing";

type DockerChild = {
  once(event: "error", listener: (error: NodeJS.ErrnoException) => void): void;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): void;
};

type DockerSpawn = (
  command: string,
  args: readonly string[],
  options: { stdio: "ignore" },
) => DockerChild;

/**
 * `docker info` exits 0 when the daemon is up. A non-zero exit is the
 * daemon-down case (including a stopped Docker Desktop). ENOENT means the
 * binary is not on PATH; that is not reported as "not running".
 *
 * stderr is discarded. The friendly message must not include raw daemon text.
 */
export function inspectDockerDaemon(
  spawnFn: DockerSpawn = spawn as unknown as DockerSpawn,
): Promise<DockerDaemonStatus> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (status: DockerDaemonStatus) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };

    const child: DockerChild = spawnFn("docker", ["info"], { stdio: "ignore" });
    child.once("error", (error) => {
      if (error.code === "ENOENT") {
        finish("missing");
        return;
      }
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once("exit", (code) => {
      finish(code === 0 ? "running" : "not-running");
    });
  });
}

export async function assertDockerDaemonRunning(
  spawnFn?: DockerSpawn,
): Promise<void> {
  const status = await inspectDockerDaemon(spawnFn);
  if (status === "not-running") {
    throw new Error(DOCKER_NOT_RUNNING_MESSAGE);
  }
}
