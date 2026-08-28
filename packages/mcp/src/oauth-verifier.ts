import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import {
  InsufficientScopeError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * Bearer token verification for the remote (HTTP) transport.
 *
 * The one rule this file exists to enforce: a token is accepted only when it
 * was issued FOR this server. `docs/remote-mcp.md` records the probe that makes
 * this non-negotiable — Medplum accepts an RFC 8707 `resource` parameter with
 * HTTP 200 and then ignores it, returning a token whose audience is Medplum
 * itself. So a FHIR access token will always look valid and will always be
 * addressed elsewhere. Forwarding one would be the confused-deputy case: this
 * server would act on a credential minted for a different audience.
 *
 * Therefore the audience check is not a configuration option, and there is no
 * code path that accepts a token with no audience.
 */
export type OAuthVerifierConfig = {
  /**
   * This server's RFC 8707 resource identifier. A token's `aud` must equal it
   * exactly. This is the value published in the protected resource metadata.
   */
  resource: string;
  /** The authorization server expected to have issued the token. */
  issuer: string;
  /** JWKS endpoint of that authorization server. */
  jwksUri: string;
  /** Scopes every caller must present. Empty means none are required. */
  requiredScopes?: readonly string[];
};

export type OAuthTokenVerifier = {
  verifyAccessToken(token: string): Promise<AuthInfo>;
};

/** Space-delimited `scope`, or an array in `scp`. Anything else means none. */
function readScopes(payload: Record<string, unknown>): string[] {
  const scope = payload.scope;
  if (typeof scope === "string") {
    return scope.split(" ").filter(Boolean);
  }
  const scp = payload.scp;
  if (Array.isArray(scp)) {
    return scp.filter((s): s is string => typeof s === "string");
  }
  return [];
}

export function createOAuthTokenVerifier(
  config: OAuthVerifierConfig,
  /**
   * Key resolver, injectable so tests can sign against a local key set instead
   * of reaching a network JWKS. Production callers omit it.
   */
  getKey: JWTVerifyGetKey = createRemoteJWKSet(new URL(config.jwksUri)),
): OAuthTokenVerifier {
  const required = config.requiredScopes ?? [];

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let payload: Record<string, unknown>;
      try {
        // `audience` and `issuer` are passed to jose rather than checked after
        // the fact, so a token that fails either one never reaches the code
        // below. A missing `aud` fails this call too, which is the point.
        const verified = await jwtVerify(token, getKey, {
          issuer: config.issuer,
          audience: config.resource,
        });
        payload = verified.payload as Record<string, unknown>;
      } catch (error) {
        // Every failure is reported the same way on purpose. Distinguishing
        // "wrong audience" from "bad signature" from "expired" would tell a
        // caller which part of a token to change next.
        throw new InvalidTokenError(
          error instanceof Error && error.message
            ? `Token rejected: ${error.message}`
            : "Token rejected.",
        );
      }

      const scopes = readScopes(payload);
      const missing = required.filter((scope) => !scopes.includes(scope));
      if (missing.length > 0) {
        throw new InsufficientScopeError(
          `Token is missing required scope(s): ${missing.join(", ")}.`,
        );
      }

      const clientId =
        typeof payload.client_id === "string"
          ? payload.client_id
          : typeof payload.azp === "string"
            ? payload.azp
            : typeof payload.sub === "string"
              ? payload.sub
              : undefined;
      if (!clientId) {
        // AuthInfo.clientId is not optional, and inventing a placeholder would
        // put an unattributable caller into the audit trail.
        throw new InvalidTokenError(
          "Token identifies no client: none of client_id, azp, or sub is present.",
        );
      }

      return {
        token,
        clientId,
        scopes,
        expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
        resource: new URL(config.resource),
        extra: {
          subject: typeof payload.sub === "string" ? payload.sub : undefined,
          issuer: config.issuer,
        },
      };
    },
  };
}
