import { describe, it, expect, beforeAll } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTVerifyGetKey,
  type CryptoKey,
} from "jose";

import { createOAuthTokenVerifier } from "./oauth-verifier.js";

// This server's identity, and the FHIR server it talks to. The distinction is
// the whole subject of this file: a token for the second must never be accepted
// as a token for the first.
const RESOURCE = "https://mcp.example.test/";
const ISSUER = "https://auth.example.test/";
const FHIR_SERVER = "https://api.medplum.com/";

let privateKey: CryptoKey;
let getKey: JWTVerifyGetKey;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = (await exportJWK(pair.publicKey)) as JWK;
  jwk.alg = "RS256";
  jwk.kid = "test-key";
  getKey = createLocalJWKSet({ keys: [jwk] });

  // A key the verifier does not know, for the forged-signature case.
  const other = await generateKeyPair("RS256");
  otherPrivateKey = other.privateKey;
});

type Claims = {
  /** `null` omits the claim entirely. `undefined` means "use the default". */
  aud?: string | string[] | null;
  iss?: string;
  scope?: string;
  scp?: string[];
  client_id?: string;
  azp?: string;
  sub?: string;
  expiresIn?: string;
  signWith?: CryptoKey;
};

async function token(claims: Claims = {}): Promise<string> {
  const {
    aud = RESOURCE,
    iss = ISSUER,
    expiresIn = "5m",
    signWith,
    ...rest
  } = claims;
  const payload: Record<string, unknown> = { ...rest };
  if (aud !== null) payload.aud = aud;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(iss)
    .setExpirationTime(expiresIn)
    .sign(signWith ?? privateKey);
}

const verifier = (requiredScopes?: string[]) =>
  createOAuthTokenVerifier(
    { resource: RESOURCE, issuer: ISSUER, jwksUri: "https://unused.test/jwks", requiredScopes },
    getKey,
  );

describe("remote MCP bearer verification", () => {
  it("accepts a token addressed to this server", async () => {
    const info = await verifier().verifyAccessToken(
      await token({ client_id: "agent-1", sub: "user-9", scope: "chart.read chart.write" }),
    );
    expect(info.clientId).toBe("agent-1");
    expect(info.scopes).toEqual(["chart.read", "chart.write"]);
    expect(info.resource?.href).toBe(RESOURCE);
    expect(info.extra?.subject).toBe("user-9");
  });

  // The reason this module exists. docs/remote-mcp.md records the probe: a
  // Medplum token is a valid, correctly signed JWT whose audience is Medplum,
  // because Medplum accepts an RFC 8707 `resource` parameter and ignores it.
  // Accepting one here would make this server a confused deputy.
  it("refuses a token whose audience is the FHIR server", async () => {
    await expect(
      verifier().verifyAccessToken(await token({ aud: FHIR_SERVER, client_id: "agent-1" })),
    ).rejects.toThrow(/Token rejected/);
  });

  it("refuses a token carrying no audience at all", async () => {
    await expect(
      verifier().verifyAccessToken(await token({ aud: null, client_id: "agent-1" })),
    ).rejects.toThrow(/Token rejected/);
  });

  it("refuses a token from an unexpected issuer", async () => {
    await expect(
      verifier().verifyAccessToken(
        await token({ iss: "https://attacker.example.test/", client_id: "agent-1" }),
      ),
    ).rejects.toThrow(/Token rejected/);
  });

  it("refuses a token signed by an unknown key", async () => {
    await expect(
      verifier().verifyAccessToken(await token({ client_id: "agent-1", signWith: otherPrivateKey })),
    ).rejects.toThrow(/Token rejected/);
  });

  it("refuses an expired token", async () => {
    await expect(
      verifier().verifyAccessToken(await token({ client_id: "agent-1", expiresIn: "-1m" })),
    ).rejects.toThrow(/Token rejected/);
  });

  it("accepts a multi-audience token that includes this server", async () => {
    // RFC 7519 allows an array. Membership is what matters, not sole occupancy.
    const info = await verifier().verifyAccessToken(
      await token({ aud: [FHIR_SERVER, RESOURCE], client_id: "agent-1" }),
    );
    expect(info.clientId).toBe("agent-1");
  });

  it("refuses a multi-audience token that omits this server", async () => {
    await expect(
      verifier().verifyAccessToken(
        await token({ aud: [FHIR_SERVER, "https://other.test/"], client_id: "agent-1" }),
      ),
    ).rejects.toThrow(/Token rejected/);
  });

  it("reports the same message for every rejection", async () => {
    // A verifier that says which check failed tells a caller what to change.
    const cases = [
      await token({ aud: FHIR_SERVER, client_id: "a" }),
      await token({ iss: "https://attacker.test/", client_id: "a" }),
      await token({ client_id: "a", signWith: otherPrivateKey }),
    ];
    const messages = new Set<string>();
    for (const t of cases) {
      await verifier()
        .verifyAccessToken(t)
        .catch((e: Error) => messages.add(e.message.split(":")[0]));
    }
    expect([...messages]).toEqual(["Token rejected"]);
  });

  describe("scopes", () => {
    it("enforces required scopes", async () => {
      await expect(
        verifier(["chart.read"]).verifyAccessToken(
          await token({ client_id: "a", scope: "profile" }),
        ),
      ).rejects.toThrow(/missing required scope\(s\): chart\.read/);
    });

    it("accepts when every required scope is present", async () => {
      const info = await verifier(["chart.read"]).verifyAccessToken(
        await token({ client_id: "a", scope: "profile chart.read" }),
      );
      expect(info.scopes).toContain("chart.read");
    });

    it("reads array-shaped scp as well as space-delimited scope", async () => {
      const info = await verifier(["chart.read"]).verifyAccessToken(
        await token({ client_id: "a", scp: ["chart.read", "profile"] }),
      );
      expect(info.scopes).toEqual(["chart.read", "profile"]);
    });

    it("treats a token with no scope claim as having none", async () => {
      const info = await verifier().verifyAccessToken(await token({ client_id: "a" }));
      expect(info.scopes).toEqual([]);
    });
  });

  describe("caller identity", () => {
    it("prefers client_id, then azp, then sub", async () => {
      const all = await verifier().verifyAccessToken(
        await token({ client_id: "c", azp: "z", sub: "s" }),
      );
      expect(all.clientId).toBe("c");
      const byAzp = await verifier().verifyAccessToken(await token({ azp: "z", sub: "s" }));
      expect(byAzp.clientId).toBe("z");
      const bySub = await verifier().verifyAccessToken(await token({ sub: "s" }));
      expect(bySub.clientId).toBe("s");
    });

    it("refuses a token that identifies no caller", async () => {
      // An unattributable caller would land in the audit trail as a placeholder.
      await expect(verifier().verifyAccessToken(await token({}))).rejects.toThrow(
        /identifies no client/,
      );
    });
  });
});
