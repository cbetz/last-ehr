import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

// These values deliberately override any .env.local configuration inherited
// from a developer's normal setup. `demo:local` is a reproducible, no-key
// evaluation path, not a shortcut that can accidentally target Medplum or an
// external model provider.
const scriptedDemoEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "development",
  FHIR_BACKEND: "hapi",
  FHIR_BASE_URL: "http://localhost:8080/fhir",
  // Pin the per-backend URL overrides too, so an exported HAPI_BASE_URL (or
  // sibling) can never steer the no-key demo away from the local stack.
  HAPI_BASE_URL: "",
  FIRELY_BASE_URL: "",
  AIDBOX_BASE_URL: "",
  OYSTEHR_CLIENT_ID: "",
  OYSTEHR_CLIENT_SECRET: "",
  OYSTEHR_BASE_URL: "",
  OYSTEHR_PROJECT_ID: "",
  AI_PROVIDER: "scripted",
  LASTEHR_SCRIPTED_DEMO: "true",
  NEXT_PUBLIC_QUICKSTART: "true",
  NEXT_PUBLIC_SCRIPTED_DEMO: "true",
  NEXT_PUBLIC_POSTHOG_KEY: "",
  NEXT_PUBLIC_POSTHOG_HOST: "",
  NEXT_PUBLIC_MEDPLUM_BASE_URL: "",
  NEXT_PUBLIC_MEDPLUM_GOOGLE_CLIENT_ID: "",
  NEXT_PUBLIC_GOOGLE_AUTH_ORIGINS: "",
  NEXT_PUBLIC_DEMO_MODELS: "",
  NEXT_PUBLIC_DEMO_BACKENDS: "",
  // The zero-key walkthrough gets the full under-the-hood experience against
  // its local Docker HAPI stack (synthetic data only).
  NEXT_PUBLIC_DEMO_DEV_OUTPUT: "true",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  KV_REST_API_URL: "",
  KV_REST_API_TOKEN: "",
};

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: scriptedDemoEnv,
      shell: false,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(new Error(`Could not start ${command}: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${
            signal ? `signal ${signal}` : `code ${code ?? 1}`
          }.`,
        ),
      );
    });
  });
}

async function runDevServer(): Promise<void> {
  const child = spawn(npm, ["run", "dev"], {
    cwd: process.cwd(),
    env: scriptedDemoEnv,
    shell: false,
    stdio: "inherit",
  });

  const forwardSignal = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      reject(new Error(`Could not start the local demo: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") {
        resolve();
        return;
      }
      reject(
        new Error(
          `The local demo stopped with ${
            signal ? `signal ${signal}` : `code ${code ?? 1}`
          }.`,
        ),
      );
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prepareOnly = args.length === 1 && args[0] === "--prepare";
  if (args.length > 0 && !prepareOnly) {
    throw new Error("Usage: npm run demo:local [-- --prepare]");
  }

  console.log("Starting the local HAPI FHIR stack…");
  await run("docker", ["compose", "up", "-d"]);

  console.log("Waiting for HAPI FHIR…");
  await run(npm, ["run", "fhir:wait"]);

  console.log("Seeding the synthetic FHIR records…");
  await run(npm, ["run", "seed"]);

  if (prepareOnly) {
    console.log("Local scripted demo is prepared.");
    return;
  }

  console.log(
    "Opening the zero-key scripted demo at http://localhost:3000/demo\n" +
      "Press Ctrl-C to stop Next.js. The local HAPI data stays running; use " +
      "npm run demo:local:down when you want to remove the stack.",
  );
  await runDevServer();
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Local demo setup failed.",
  );
  process.exitCode = 1;
});
