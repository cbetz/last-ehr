import { cookies } from "next/headers";

import { requestOrigin } from "@/lib/smart";

// SMART App Launch, step 2. The EHR's authorize endpoint redirects back here
// with ?code=...&state=... . We verify the state, exchange the code (public
// client + PKCE), and hand the access token to the same HttpOnly-cookie
// session the rest of the app already uses. A readable smart_session marker
// tells the demo page to skip the sign-in gate and the quickstart mint.
export const runtime = "nodejs";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  patient?: string;
  scope?: string;
};

export async function GET(req: Request) {
  const clientId = process.env.SMART_CLIENT_ID;
  if (!clientId) {
    return new Response("SMART launch is not configured.", { status: 404 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    console.error("SMART authorize error:", oauthError);
    return new Response(`Launch was not authorized (${oauthError}).`, {
      status: 400,
    });
  }
  if (!code || !state) {
    return new Response("Missing code or state parameter.", { status: 400 });
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("smart_state")?.value;
  const verifier = cookieStore.get("smart_verifier")?.value;
  const tokenEndpoint = cookieStore.get("smart_token_endpoint")?.value;

  // One-shot nonces: clear regardless of outcome.
  for (const name of ["smart_state", "smart_verifier", "smart_token_endpoint"]) {
    cookieStore.delete(name);
  }

  if (!expectedState || !verifier || !tokenEndpoint) {
    return new Response(
      "Launch session expired. Start again from your EHR.",
      { status: 400 },
    );
  }
  if (state !== expectedState) {
    return new Response("State mismatch.", { status: 400 });
  }

  const redirectUri = `${requestOrigin(req)}/launch/callback`;
  let token: TokenResponse;
  try {
    const res = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) {
      console.error("SMART token exchange failed:", res.status, await res.text());
      return new Response("Token exchange failed.", { status: 502 });
    }
    token = (await res.json()) as TokenResponse;
  } catch (err) {
    console.error("SMART token exchange error:", err);
    return new Response("Token exchange failed.", { status: 502 });
  }

  if (!token.access_token) {
    return new Response("Token response had no access token.", {
      status: 502,
    });
  }

  const secure = process.env.NODE_ENV === "production";
  // Match the cookie lifetime to the token's, with a safety margin, and fall
  // back to one hour when the server omits expires_in.
  const maxAge = Math.max(60, (token.expires_in ?? 3600) - 60);

  cookieStore.set("medplum_access_token", token.access_token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  // Readable marker (no secret value) so the client can tell a SMART session
  // exists behind the HttpOnly cookie.
  cookieStore.set("smart_session", "1", {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  // A leftover public-demo session id would make the chat route demo-tag this
  // real session's writes and filter its reads. SMART sessions are real.
  cookieStore.delete("demo_session_id");

  const destination = new URL("/demo", requestOrigin(req));
  if (token.patient && /^[A-Za-z0-9-]{1,64}$/.test(token.patient)) {
    destination.searchParams.set("patient", token.patient);
  }
  return Response.redirect(destination.toString(), 302);
}
