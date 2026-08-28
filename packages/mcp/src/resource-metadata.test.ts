import { describe, it, expect } from "vitest";
import { OAuthProtectedResourceMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";

import { buildResourceMetadata } from "./resource-metadata.js";

const RESOURCE = "https://mcp.example.test/mcp";
const AUTH_SERVER = "https://auth.example.test/";

describe("protected resource metadata", () => {
  // The document is only useful if a real client can parse it, so it is checked
  // against the SDK's own schema rather than against hand-written expectations.
  it("validates against the SDK's RFC 9728 schema", () => {
    const parsed = OAuthProtectedResourceMetadataSchema.safeParse(
      buildResourceMetadata({ resource: RESOURCE, authorizationServer: AUTH_SERVER }),
    );
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("names the authorization server, because Medplum cannot be one", () => {
    // docs/remote-mcp.md: Medplum issues tokens addressed to itself and ignores
    // the RFC 8707 resource parameter, so the operator must run a separate
    // authorization server and this document is how a client finds it.
    const meta = buildResourceMetadata({
      resource: RESOURCE,
      authorizationServer: AUTH_SERVER,
    });
    expect(meta.resource).toBe(RESOURCE);
    expect(meta.authorization_servers).toEqual([AUTH_SERVER]);
  });

  it("advertises header-only bearer transmission", () => {
    // Query-parameter and form-body bearer tokens end up in access logs and
    // referrer headers. RFC 6750 discourages both.
    const meta = buildResourceMetadata({
      resource: RESOURCE,
      authorizationServer: AUTH_SERVER,
    });
    expect(meta.bearer_methods_supported).toEqual(["header"]);
  });

  it("includes scopes only when the operator requires some", () => {
    const withScopes = buildResourceMetadata({
      resource: RESOURCE,
      authorizationServer: AUTH_SERVER,
      scopesSupported: ["chart.read"],
    });
    expect(withScopes.scopes_supported).toEqual(["chart.read"]);

    // An empty array would advertise "this server supports no scopes", which is
    // a different claim from "this server requires none".
    const withoutScopes = buildResourceMetadata({
      resource: RESOURCE,
      authorizationServer: AUTH_SERVER,
      scopesSupported: [],
    });
    expect("scopes_supported" in withoutScopes).toBe(false);
  });

  it("omits documentation rather than emitting an empty value", () => {
    const meta = buildResourceMetadata({
      resource: RESOURCE,
      authorizationServer: AUTH_SERVER,
    });
    expect("resource_documentation" in meta).toBe(false);

    const documented = buildResourceMetadata({
      resource: RESOURCE,
      authorizationServer: AUTH_SERVER,
      documentation: "https://www.lastehr.com/docs/mcp",
    });
    expect(documented.resource_documentation).toBe("https://www.lastehr.com/docs/mcp");
  });

  it("copies the caller's scope list, so later mutation cannot leak in", () => {
    const scopes = ["chart.read"];
    const meta = buildResourceMetadata({
      resource: RESOURCE,
      authorizationServer: AUTH_SERVER,
      scopesSupported: scopes,
    });
    scopes.push("chart.write");
    expect(meta.scopes_supported).toEqual(["chart.read"]);
  });

  it("sits at the well-known URL the SDK derives for this resource", () => {
    // The 401 from requireBearerAuth points a client here, so the document has
    // to be served from the path the SDK computes.
    expect(getOAuthProtectedResourceMetadataUrl(new URL(RESOURCE))).toBe(
      "https://mcp.example.test/.well-known/oauth-protected-resource/mcp",
    );
  });
});
