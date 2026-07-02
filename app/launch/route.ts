import { cookies } from "next/headers";

import {
  createPkcePair,
  expectedIssuer,
  fetchSmartConfiguration,
  randomState,
  requestOrigin,
} from "@/lib/smart";

// SMART App Launch, step 1 (EHR launch). Medplum (or another SMART-enabled
// EHR) redirects the user here with ?iss=<fhir-base>&launch=<launch-id> when
// they open Last EHR from a patient or encounter page. We validate the issuer,
// discover the authorize endpoint, and redirect into the OAuth2 authorization
// code + PKCE flow as a public client (no client secret).
//
// Register the app in Medplum by creating a ClientApplication with
// launchUri = https://<your-deploy>/launch and
// redirectUri = https://<your-deploy>/launch/callback, then set its id here
// as SMART_CLIENT_ID.
export const runtime = "nodejs";

// Ten minutes to complete the hop through the EHR's authorize screen.
const NONCE_COOKIE_MAX_AGE = 600;

export async function GET(req: Request) {
  const clientId = process.env.SMART_CLIENT_ID;
  if (!clientId) {
    return new Response(
      "SMART launch is not configured. Set SMART_CLIENT_ID to the id of the " +
        "ClientApplication you registered in Medplum.",
      { status: 404 },
    );
  }

  const url = new URL(req.url);
  const iss = url.searchParams.get("iss");
  const launch = url.searchParams.get("launch");
  if (!iss || !launch) {
    return new Response("Missing iss or launch parameter.", { status: 400 });
  }

  // Only accept launches from the FHIR server this deployment is configured
  // for. A forged iss would otherwise let an attacker mint a session against
  // a server they control.
  const expected = expectedIssuer();
  if (iss.replace(/\/+$/, "") !== expected) {
    return new Response(
      `This deployment only accepts launches from ${expected}.`,
      { status: 400 },
    );
  }

  let config;
  try {
    config = await fetchSmartConfiguration(iss);
  } catch (err) {
    console.error("SMART configuration discovery failed:", err);
    return new Response("Could not discover the SMART configuration.", {
      status: 502,
    });
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomState();
  const redirectUri = `${requestOrigin(req)}/launch/callback`;
  // Least-privilege default: read+search on what the chart shows, create only
  // for the two write tools. patient/ scopes also compartment the session to
  // the launched patient (Medplum appends _compartment=Patient/<id>), so a
  // SMART session sees that patient's data, which is the point of a launch.
  const scope =
    process.env.SMART_SCOPES ||
    "launch launch/patient openid fhirUser " +
      "patient/Patient.rs patient/Condition.rs " +
      "patient/AllergyIntolerance.rs patient/MedicationRequest.rs " +
      "patient/Immunization.rs patient/Observation.crs " +
      "patient/Communication.crs";

  const authorize = new URL(config.authorization_endpoint);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", scope);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("aud", iss);
  authorize.searchParams.set("launch", launch);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const secure = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  const nonceCookie = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: NONCE_COOKIE_MAX_AGE,
  };
  cookieStore.set("smart_state", state, nonceCookie);
  cookieStore.set("smart_verifier", verifier, nonceCookie);
  cookieStore.set("smart_token_endpoint", config.token_endpoint, nonceCookie);

  return Response.redirect(authorize.toString(), 302);
}
