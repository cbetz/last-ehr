import posthog from "posthog-js";

// Thin wrapper over PostHog capture. Analytics are optional (the key is unset
// for most self-hosters), so this is a silent no-op unless the provider
// initialized PostHog (see components/providers.tsx). Event properties must
// never include chart content; names and counts only.
export function track(
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined" || !process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return;
  }
  posthog.capture(event, properties);
}
