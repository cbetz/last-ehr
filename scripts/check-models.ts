import { config as loadEnv } from "dotenv";

import { parseDemoModels } from "../lib/ai/demo-models";

// Sanity-checks the demo model picker allowlist against the configured
// provider's model catalog (existence only; the catalogs do not expose
// tool-capability metadata, so confirming tool support stays the operator's
// job). Best effort by default; --strict makes an unreachable catalog fatal.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const strict = process.argv.includes("--strict");

async function catalogIds(): Promise<{ source: string; ids: Set<string> } | null> {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  try {
    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      return {
        source: "openai",
        ids: new Set((body.data ?? []).map((m) => m.id)),
      };
    }
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      return {
        source: "anthropic",
        ids: new Set((body.data ?? []).map((m) => m.id)),
      };
    }
  } catch (err) {
    console.warn(`catalog unavailable: ${String(err)}`);
  }
  return null;
}

async function main(): Promise<void> {
  const models = parseDemoModels(process.env.NEXT_PUBLIC_DEMO_MODELS);
  if (models.length === 0) {
    console.log("NEXT_PUBLIC_DEMO_MODELS is empty; nothing to check.");
    return;
  }

  const catalog = await catalogIds();
  if (!catalog) {
    const message =
      "No provider catalog reachable (missing key or network); cannot verify the allowlist.";
    if (strict) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return;
  }

  let failed = false;
  for (const m of models) {
    if (catalog.ids.has(m.id)) {
      console.log(`ok       ${m.id} (${catalog.source})`);
    } else {
      console.error(`MISSING  ${m.id} (not in the ${catalog.source} catalog)`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log(
    "Reminder: existence only; confirm each model supports tool calling.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
