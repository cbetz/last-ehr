const STARS_URL = "https://api.github.com/repos/cbetz/last-ehr";

/** Public stargazer count, or null when the lookup is skipped or fails. */
export async function githubStarCount(): Promise<number | null> {
  try {
    const response = await fetch(STARS_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "lastehr.com",
      },
      next: { revalidate: 60 * 60 },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("stargazers_count" in body)) return null;
    const count = body.stargazers_count;
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return null;
    return count;
  } catch {
    return null;
  }
}
