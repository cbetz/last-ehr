import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { MedplumClient } from "@medplum/core";

import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limit";

// Node runtime so @medplum/core works.
export const runtime = "nodejs";

const COOKIE_NAME = "medplum_access_token";
const SESSION_ID_COOKIE = "demo_session_id";

// Quickstart sign-in for self-hosters (and the public demo): mint a Medplum
// access token server-side from a ClientApplication's client credentials and
// set it as the same HttpOnly session cookie the chat route reads. This lets
// `clone -> up -> ask` work without registering a Google OAuth client.
//
// Enable by setting MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET (and
// NEXT_PUBLIC_QUICKSTART=true so /demo renders the chat directly). All visitors
// share one ClientApplication token, so we cache it (below) rather than calling
// the auth backend on every request — a request storm can't fan out to Medplum.
// Each visitor still gets a unique session id used to isolate their demo writes.

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

/** Seconds until a JWT access token expires (from its `exp` claim). */
function tokenTtlSeconds(token: string): number {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8"),
    );
    if (typeof decoded.exp === "number") {
      return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // Fall through to the default below.
  }
  return 60 * 60;
}

/**
 * Return the shared quickstart token, minting a fresh one only when the cache
 * is empty or near expiry. `maxAge` is the cookie lifetime (seconds) matched to
 * the token's real remaining life so a cookie never outlives its token.
 */
async function getQuickstartToken(
  clientId: string,
  clientSecret: string,
): Promise<{ token: string; maxAge: number } | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return {
      token: cachedToken.value,
      maxAge: Math.max(1, Math.floor((cachedToken.expiresAt - now) / 1000)),
    };
  }

  const medplum = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL || undefined,
    fetch,
  });
  await medplum.startClientLogin(clientId, clientSecret);
  const token = medplum.getAccessToken();
  if (!token) return null;

  // Refresh 60s before the real expiry so we never serve a token about to die.
  const usableTtl = Math.max(1, tokenTtlSeconds(token) - 60);
  cachedToken = { value: token, expiresAt: now + usableTtl * 1000 };
  return { token, maxAge: usableTtl };
}

export async function POST(req: Request) {
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(
      "Quickstart not configured. Set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET.",
      { status: 404 },
    );
  }

  const { success } = await checkRateLimit(`quickstart:${getClientIp(req)}`);
  if (!success) {
    return new Response("Too many requests. Please try again shortly.", {
      status: 429,
    });
  }

  let minted: { token: string; maxAge: number } | null;
  try {
    minted = await getQuickstartToken(clientId, clientSecret);
  } catch (err) {
    console.error("Quickstart client login failed", err);
    return new Response("Quickstart login failed", { status: 502 });
  }
  if (!minted) {
    return new Response("Quickstart login produced no token", { status: 502 });
  }

  const secure = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, minted.token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: minted.maxAge,
  });
  // Per-visitor id used server-side to isolate demo writes; nothing reads it
  // client-side, so keep it HttpOnly.
  cookieStore.set(SESSION_ID_COOKIE, randomUUID(), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: minted.maxAge,
  });

  return new Response(null, { status: 204 });
}
