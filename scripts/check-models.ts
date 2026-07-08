import { config as loadEnv } from "dotenv";

import { parseDemoModels } from "../lib/ai/demo-models";

// Verifies every model on the demo picker allowlist exists in an aggregator
// catalog AND supports tool calling; the agent is tool calls or nothing, so
// a non-tool model on the picker breaks the demo for whoever selects it.
//
//   npm run check:models            best effort (network failures warn)
//   npm run check:models -- --strict  network failures fail too (deploy gate)
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const strict = process.argv.includes("--strict");

type Verdict = { id: string; found: boolean; tools: boolean; source: string };

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function main(): Promise<void> {
  const models = parseDemoModels(process.env.NEXT_PUBLIC_DEMO_MODELS);
  if (models.length === 0) {
    console.log("NEXT_PUBLIC_DEMO_MODELS is empty; nothing to check.");
    return;
  }

  // OpenRouter's catalog is public. supported_parameters includes "tools"
  // for tool-capable models.
  const catalogs: Array<{ name: string; ids: Map<string, boolean> }> = [];
  try {
    const or = await fetchJson("https://openrouter.ai/api/v1/models");
    const ids = new Map<string, boolean>(
      (or.data ?? []).map(
        (m: { id: string; supported_parameters?: string[] }) => [
          m.id,
          (m.supported_parameters ?? []).includes("tools"),
        ],
      ),
    );
    catalogs.push({ name: "openrouter", ids });
  } catch (err) {
    console.warn(`openrouter catalog unavailable: ${String(err)}`);
  }

  // The Vercel AI Gateway catalog needs the key; tool support is tagged.
  if (process.env.AI_GATEWAY_API_KEY) {
    try {
      const gw = await fetchJson("https://ai-gateway.vercel.sh/v1/models", {
        authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
      });
      const ids = new Map<string, boolean>(
        (gw.data ?? []).map((m: { id: string; tags?: string[] }) => [
          m.id,
          (m.tags ?? []).includes("tool-use"),
        ]),
      );
      catalogs.push({ name: "gateway", ids });
    } catch (err) {
      console.warn(`gateway catalog unavailable: ${String(err)}`);
    }
  }

  if (catalogs.length === 0) {
    const message = "No catalog reachable; cannot verify the allowlist.";
    if (strict) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
    return;
  }

  const verdicts: Verdict[] = models.map((m) => {
    for (const catalog of catalogs) {
      if (catalog.ids.has(m.id)) {
        return {
          id: m.id,
          found: true,
          tools: catalog.ids.get(m.id) === true,
          source: catalog.name,
        };
      }
    }
    return { id: m.id, found: false, tools: false, source: "none" };
  });

  let failed = false;
  for (const v of verdicts) {
    if (!v.found) {
      console.error(`MISSING  ${v.id} (not in any reachable catalog)`);
      failed = true;
    } else if (!v.tools) {
      console.error(`NO-TOOLS ${v.id} (${v.source}: no tool support)`);
      failed = true;
    } else {
      console.log(`ok       ${v.id} (${v.source}, tool-capable)`);
    }
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
