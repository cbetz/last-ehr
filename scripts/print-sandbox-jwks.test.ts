import { exportPKCS8, generateKeyPair, importJWK } from "jose";
import { describe, expect, it } from "vitest";

import { publicJwks } from "./print-sandbox-jwks";

describe("print-sandbox-jwks", () => {
  it("prints a public RS384 JWKS and no private component", async () => {
    const { privateKey } = await generateKeyPair("RS384", {
      extractable: true,
    });
    const pem = await exportPKCS8(privateKey);
    const jwks = await publicJwks(pem, "lastehr-epic-1");
    const serialized = JSON.stringify(jwks);
    expect(serialized).not.toContain('"d"');
    expect(serialized).not.toContain(pem);
    expect(jwks.keys[0]?.kid).toBe("lastehr-epic-1");
    expect(jwks.keys[0]?.alg).toBe("RS384");
    expect(jwks.keys[0]?.use).toBe("sig");
    const imported = await importJWK(jwks.keys[0], "RS384");
    expect(imported instanceof Uint8Array).toBe(false);
    if (imported instanceof Uint8Array) return;
    expect(imported.type).toBe("public");
  });
});
