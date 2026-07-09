// The demo model picker's shared, dependency-free logic. This module is
// imported by BOTH the client (the picker dropdown) and the server (the chat
// route's gate), so it must stay free of provider SDK imports.
//
// NEXT_PUBLIC_DEMO_MODELS declares the picker options as a comma-separated
// list of "model-id|Label" pairs, e.g.
//   NEXT_PUBLIC_DEMO_MODELS=gpt-4.1-mini|GPT-4.1 mini,gpt-5-mini|GPT-5 mini
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
 * Server-side gate for the x-demo-model header: honored only for ids on the
 * operator-authored allowlist. One provider key already serves several
 * models (gpt-4.1-mini and gpt-5-mini on one OpenAI key; haiku and sonnet on
 * one Anthropic key), so the picker works on any provider. Unlisted values
 * return undefined and fall back to MODEL_ID without erroring, so probing
 * yields no signal.
 */
export function resolveDemoModel(
  requested: string | null,
  allowlist: DemoModel[],
): string | undefined {
  if (!requested) return undefined;
  return allowlist.some((m) => m.id === requested) ? requested : undefined;
}
