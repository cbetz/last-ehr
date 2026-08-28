import type { OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * RFC 9728 protected resource metadata for the remote (HTTP) transport.
 *
 * This document is how a client discovers which authorization server to use.
 * It exists because Medplum cannot be that authorization server: the probe in
 * docs/remote-mcp.md shows Medplum issues tokens addressed to itself and
 * ignores the RFC 8707 `resource` parameter. So the operator runs a separate
 * authorization server, and this document names it rather than leaving a client
 * to guess.
 *
 * The SDK's `getOAuthProtectedResourceMetadataUrl` builds the URL this belongs
 * at. The 401 from `requireBearerAuth` points there through its
 * `WWW-Authenticate` header.
 */
export type ResourceMetadataOptions = {
  /**
   * This server's resource identifier. Must be the same value the token
   * verifier requires as an audience, or a client would obtain a token this
   * server then refuses.
   */
  resource: string;
  /** Issuer URL of the authorization server that mints tokens for it. */
  authorizationServer: string;
  /** Scopes an operator has chosen to require. */
  scopesSupported?: readonly string[];
  /** Where a human reads what this surface does. */
  documentation?: string;
};

export function buildResourceMetadata(
  options: ResourceMetadataOptions,
): OAuthProtectedResourceMetadata {
  return {
    resource: options.resource,
    authorization_servers: [options.authorizationServer],
    // Header only. Query-parameter and form-body bearer tokens land in access
    // logs and referrers, and RFC 6750 discourages both.
    bearer_methods_supported: ["header"],
    ...(options.scopesSupported && options.scopesSupported.length > 0
      ? { scopes_supported: [...options.scopesSupported] }
      : {}),
    resource_name: "Last EHR MCP",
    ...(options.documentation ? { resource_documentation: options.documentation } : {}),
  };
}
