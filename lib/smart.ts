import { createHash, randomBytes } from "node:crypto";

// Helpers for SMART App Launch (the /launch and /launch/callback routes).

export function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** RFC 7636 PKCE pair: high-entropy verifier and its S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return base64url(randomBytes(24));
}

/**
 * The FHIR base URL (iss) we accept launches from. Derived from the same env
 * that configures the rest of the app, so a self-hoster's Medplum works
 * without extra config. Hosted Medplum serves FHIR at /fhir/R4.
 */
export function expectedIssuer(): string {
  const base = (
    process.env.MEDPLUM_BASE_URL || "https://api.medplum.com"
  ).replace(/\/+$/, "");
  return `${base}/fhir/R4`;
}

export type SmartConfiguration = {
  authorization_endpoint: string;
  token_endpoint: string;
};

/** Discover the authorize/token endpoints from the FHIR server. */
export async function fetchSmartConfiguration(
  iss: string,
): Promise<SmartConfiguration> {
  const res = await fetch(
    `${iss.replace(/\/+$/, "")}/.well-known/smart-configuration`,
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(`smart-configuration fetch failed: ${res.status}`);
  }
  const config = (await res.json()) as Partial<SmartConfiguration>;
  if (!config.authorization_endpoint || !config.token_endpoint) {
    throw new Error("smart-configuration missing endpoints");
  }
  return config as SmartConfiguration;
}

/** Origin for building our redirect_uri behind Vercel's proxy. */
export function requestOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  return `${proto}://${host}`;
}
