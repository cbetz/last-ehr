/**
 * RFC 8693 token exchange: turn a verified caller token into that caller's own
 * FHIR access token.
 *
 * This is the half of the remote transport that keeps the design honest. The
 * stdio server holds one FHIR credential from env, which is right for one
 * operator on one machine. A remote server holding one credential would give
 * every caller identical FHIR access and would make this layer, rather than
 * the FHIR backend, the thing that decides who sees what. So the credential is
 * obtained per caller here instead.
 *
 * Verified live against Medplum 5.1.35, recorded in docs/remote-mcp.md:
 * - The exchange returns an ordinary user token bound to a ProjectMembership,
 *   so the caller's AccessPolicy applies. Probed with a policy allowing Patient
 *   and omitting Observation: Patient answered 200 and Observation answered 403
 *   on the exchanged token, while an unrestricted token answered 200 for both.
 * - No client secret is checked on this path, so this server stores none.
 */

/** The subject token type Medplum requires; the only one it accepts. */
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";

export type TokenExchangeConfig = {
  /** The authorization server's token endpoint, e.g. `.../oauth2/token`. */
  tokenEndpoint: string;
  /**
   * The FHIR-side client registered with an identity provider. Its project
   * scopes the resulting login, which is why a multi-project user cannot land
   * in an unrelated project (see docs/remote-mcp.md).
   */
  clientId: string;
  /**
   * Optional ProjectMembership to pin. The handler passes
   * `forceUseFirstMembership`, so when a caller holds several memberships
   * inside the client's project, ordering decides which one is used. Sending
   * this removes that ambiguity.
   */
  membershipId?: string;
};

export type ExchangedFhirToken = {
  accessToken: string;
  /** Seconds since the epoch, when the server reported a lifetime. */
  expiresAt?: number;
  /** Reference strings, useful for audit and for diagnostics. Never secrets. */
  profile?: string;
  project?: string;
  scope?: string;
};

export class TokenExchangeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TokenExchangeError";
  }
}

function reference(value: unknown): string | undefined {
  if (value && typeof value === "object" && "reference" in value) {
    const ref = (value as { reference?: unknown }).reference;
    return typeof ref === "string" ? ref : undefined;
  }
  return undefined;
}

/**
 * Exchange a caller's verified token for their FHIR access token.
 *
 * `callerToken` is the token this server already verified as addressed to it.
 * It is sent as `subject_token` and never logged: every error path below
 * reports the server's response, not the request.
 */
export async function exchangeForFhirToken(
  callerToken: string,
  config: TokenExchangeConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangedFhirToken> {
  const body = new URLSearchParams({
    grant_type: GRANT_TYPE,
    client_id: config.clientId,
    subject_token: callerToken,
    subject_token_type: ACCESS_TOKEN_TYPE,
  });
  if (config.membershipId) {
    body.set("membership_id", config.membershipId);
  }

  let response: Response;
  try {
    response = await fetchImpl(config.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error) {
    // A transport failure must not read as a denied exchange, and it must not
    // echo the request. Fail closed with the reason only.
    throw new TokenExchangeError(
      `Token exchange could not reach the authorization server: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  if (!response.ok) {
    // The upstream description is genuinely useful here — "check your identity
    // provider configuration" is how a missing identity provider presents, and
    // an operator needs to see it. It describes the server's own state and
    // carries nothing from the request.
    let detail = "";
    try {
      const parsed = (await response.json()) as {
        error?: unknown;
        error_description?: unknown;
      };
      const code = typeof parsed.error === "string" ? parsed.error : undefined;
      const description =
        typeof parsed.error_description === "string"
          ? parsed.error_description
          : undefined;
      detail = [code, description].filter(Boolean).join(": ");
    } catch {
      detail = "";
    }
    throw new TokenExchangeError(
      `Token exchange rejected (HTTP ${response.status})${detail ? `: ${detail}` : ""}.`,
      response.status,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new TokenExchangeError(
      "Token exchange returned a body that is not JSON.",
      response.status,
    );
  }

  const accessToken = parsed.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    // A 200 with no token is the worst shape to pass along: callers would treat
    // the absence as an anonymous session rather than a failure.
    throw new TokenExchangeError(
      "Token exchange succeeded but returned no access token.",
      response.status,
    );
  }

  const expiresIn = parsed.expires_in;
  return {
    accessToken,
    expiresAt:
      typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? Math.floor(Date.now() / 1000) + expiresIn
        : undefined,
    profile: reference(parsed.profile),
    project: reference(parsed.project),
    scope: typeof parsed.scope === "string" ? parsed.scope : undefined,
  };
}
