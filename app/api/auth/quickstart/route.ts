import { cookies } from "next/headers";
import { MedplumClient } from "@medplum/core";

// Node runtime so @medplum/core works.
export const runtime = "nodejs";

const COOKIE_NAME = "medplum_access_token";

// Quickstart sign-in for self-hosters: mint a Medplum access token server-side
// from a ClientApplication's client credentials and set it as the same
// HttpOnly session cookie the chat route reads. This lets `clone -> up -> ask`
// work without registering a Google OAuth client.
//
// Enable by setting MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET (and
// NEXT_PUBLIC_QUICKSTART=true so /demo renders the chat directly). For local /
// self-host evaluation against synthetic data only — not a multi-user sign-in.
export async function POST() {
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(
      "Quickstart not configured. Set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET.",
      { status: 404 },
    );
  }

  const medplum = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL || undefined,
    fetch,
  });

  try {
    await medplum.startClientLogin(clientId, clientSecret);
  } catch (err) {
    console.error("Quickstart client login failed", err);
    return new Response("Quickstart login failed", { status: 502 });
  }

  const token = medplum.getAccessToken();
  if (!token) {
    return new Response("Quickstart login produced no token", { status: 502 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  return new Response(null, { status: 204 });
}
