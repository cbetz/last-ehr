import { config as loadEnv } from "dotenv";

// Polls the FHIR server's metadata endpoint until it answers 200. The HAPI
// image is distroless (no shell, no curl), so an in-container healthcheck is
// not possible; this script is the compose stack's readiness gate:
//   docker compose up -d && npm run fhir:wait && npm run seed
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const base = (process.env.FHIR_BASE_URL || "http://localhost:8080/fhir").replace(
  /\/+$/,
  "",
);
// First boot initializes the database schema and can take a couple of
// minutes on top of the image pull.
const deadline = Date.now() + 5 * 60 * 1000;

async function main(): Promise<void> {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/metadata`, {
        headers: { accept: "application/fhir+json" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        console.log(`FHIR server ready at ${base}`);
        return;
      }
    } catch {
      // Not up yet; keep waiting.
    }
    console.log(`waiting for FHIR server at ${base} ...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  console.error(`FHIR server at ${base} not ready after 5 minutes.`);
  process.exit(1);
}

main();
