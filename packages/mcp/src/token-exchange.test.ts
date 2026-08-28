import { describe, it, expect, vi } from "vitest";

import {
  exchangeForFhirToken,
  TokenExchangeError,
  type TokenExchangeConfig,
} from "./token-exchange.js";

const CONFIG: TokenExchangeConfig = {
  tokenEndpoint: "https://fhir.example.test/oauth2/token",
  clientId: "client-with-idp",
};

const CALLER_TOKEN = "caller-token-that-must-never-appear-in-an-error";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Captures the outgoing request so tests can assert on the exact form body. */
function recorder(response: Response | (() => never)) {
  const calls: Array<{ url: string; init: RequestInit; form: URLSearchParams }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url: String(url), init: init ?? {}, form: new URLSearchParams(body) });
    if (typeof response === "function") response();
    return response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("FHIR token exchange", () => {
  it("sends the RFC 8693 grant with the caller's token as subject_token", async () => {
    const { impl, calls } = recorder(
      jsonResponse({ access_token: "fhir-token", expires_in: 3600 }),
    );
    await exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(CONFIG.tokenEndpoint);
    expect(calls[0].init.method).toBe("POST");
    const form = calls[0].form;
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
    expect(form.get("client_id")).toBe("client-with-idp");
    expect(form.get("subject_token")).toBe(CALLER_TOKEN);
    expect(form.get("subject_token_type")).toBe(
      "urn:ietf:params:oauth:token-type:access_token",
    );
  });

  // The design's strongest property: this server stores no FHIR credential,
  // because the exchange path checks none. Verified live on Medplum 5.1.35.
  it("never sends a client secret", async () => {
    const { impl, calls } = recorder(jsonResponse({ access_token: "fhir-token" }));
    await exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl);
    expect(calls[0].form.get("client_secret")).toBeNull();
    expect(calls[0].form.has("client_secret")).toBe(false);
  });

  it("pins the membership when one is configured, and omits it otherwise", async () => {
    // Medplum reads this as `membership_id` and passes it to the login, which
    // otherwise resolves by ordering (forceUseFirstMembership).
    const pinned = recorder(jsonResponse({ access_token: "t" }));
    await exchangeForFhirToken(
      CALLER_TOKEN,
      { ...CONFIG, membershipId: "membership-1" },
      pinned.impl,
    );
    expect(pinned.calls[0].form.get("membership_id")).toBe("membership-1");

    const unpinned = recorder(jsonResponse({ access_token: "t" }));
    await exchangeForFhirToken(CALLER_TOKEN, CONFIG, unpinned.impl);
    expect(unpinned.calls[0].form.has("membership_id")).toBe(false);
  });

  it("returns the token plus the references worth auditing", async () => {
    const { impl } = recorder(
      jsonResponse({
        access_token: "fhir-token",
        expires_in: 3600,
        scope: "openid offline_access",
        profile: { reference: "Practitioner/abc", display: "Limited User" },
        project: { reference: "Project/xyz", display: "Probe" },
      }),
    );
    const result = await exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl);
    expect(result.accessToken).toBe("fhir-token");
    expect(result.profile).toBe("Practitioner/abc");
    expect(result.project).toBe("Project/xyz");
    expect(result.scope).toBe("openid offline_access");
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("surfaces the upstream error description, which operators need", async () => {
    // This exact response is how a client with no identity provider presents.
    const { impl } = recorder(
      jsonResponse(
        {
          error: "invalid_request",
          error_description:
            "Failed to verify code - check your identity provider configuration",
        },
        400,
      ),
    );
    await expect(exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl)).rejects.toThrow(
      /HTTP 400.*invalid_request.*identity provider configuration/,
    );
  });

  it("fails closed when the authorization server is unreachable", async () => {
    const { impl } = recorder(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl)).rejects.toBeInstanceOf(
      TokenExchangeError,
    );
  });

  it("treats a 200 with no access token as a failure, not an anonymous session", async () => {
    const { impl } = recorder(jsonResponse({ expires_in: 3600 }));
    await expect(exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl)).rejects.toThrow(
      /returned no access token/,
    );
  });

  it("rejects a non-JSON success body", async () => {
    const { impl } = recorder(new Response("<html>gateway</html>", { status: 200 }));
    await expect(exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl)).rejects.toThrow(
      /not JSON/,
    );
  });

  it("keeps the caller's token out of every error message", async () => {
    // An exchange failure is a plausible place to leak the credential into a
    // log line, so this is asserted rather than assumed.
    const cases = [
      recorder(jsonResponse({ error: "invalid_request" }, 400)),
      recorder(jsonResponse({ expires_in: 1 })),
      recorder(new Response("nope", { status: 200 })),
      recorder(() => {
        throw new Error("ECONNREFUSED");
      }),
    ];
    for (const c of cases) {
      const message = await exchangeForFhirToken(CALLER_TOKEN, CONFIG, c.impl).then(
        () => "",
        (e: Error) => e.message,
      );
      expect(message).not.toContain(CALLER_TOKEN);
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("carries the HTTP status on rejection so callers can distinguish 4xx from 5xx", async () => {
    const { impl } = recorder(jsonResponse({ error: "server_error" }, 503));
    const error = await exchangeForFhirToken(CALLER_TOKEN, CONFIG, impl).catch(
      (e: TokenExchangeError) => e,
    );
    expect(error).toBeInstanceOf(TokenExchangeError);
    expect((error as TokenExchangeError).status).toBe(503);
  });
});
