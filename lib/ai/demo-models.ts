// The demo model picker's shared, dependency-free logic. This module is
// imported by BOTH the client (the picker dropdown) and the server (the chat
// route's gate), so it must stay free of provider SDK imports.
//
// NEXT_PUBLIC_DEMO_MODELS declares the picker options as a comma-separated
// list of "model-id|Label" pairs, e.g.
//   NEXT_PUBLIC_DEMO_MODELS=openai/gpt-4.1-mini|GPT-4.1 mini,anthropic/claude-haiku-4.5|Claude Haiku
// Next.js inlines NEXT_PUBLIC_* into both bundles at build time, so changing
// the list requires a rebuild (the normal Vercel model). The server side
// stays authoritative: a request naming a model off this list falls back to
// the deployment's MODEL_ID silently.

export type DemoModel = { id: string; label: string };

export function parseDemoModels(raw: string | undefined): DemoModel[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, ...labelParts] = part.split("|");
      const cleanId = id.trim();
      const label = labelParts.join("|").trim() || cleanId;
      return { id: cleanId, label };
    })
    .filter((m) => m.id.length > 0);
}

/**
 * Server-side gate for the x-demo-model header. Honored only when the
 * deployment runs an aggregator provider (the native providers have exactly
 * one configured model and key) AND the requested id is on the allowlist.
 * Anything else returns undefined: unlisted values fall back to MODEL_ID
 * without erroring, so probing yields no signal.
 */
export function resolveDemoModel(
  requested: string | null,
  provider: string,
  allowlist: DemoModel[],
): string | undefined {
  if (!requested) return undefined;
  if (provider !== "gateway" && provider !== "openrouter") return undefined;
  return allowlist.some((m) => m.id === requested) ? requested : undefined;
}
