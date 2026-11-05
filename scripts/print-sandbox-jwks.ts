import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { exportJWK, importPKCS8 } from "jose";

const PRIVATE_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "k"] as const;

/**
 * Public JWKS for an Epic or Oracle sandbox app. Prints only the public
 * RSA components. A private field in the output is a bug, so this refuses
 * to print one.
 */
export async function publicJwks(
  pem: string,
  kid: string,
): Promise<{ keys: Record<string, string>[] }> {
  const normalized = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  let jwk: { kty?: string; n?: string; e?: string };
  try {
    jwk = await exportJWK(
      await importPKCS8(normalized, "RS384", { extractable: true }),
    );
  } catch {
    throw new Error(
      "Could not read a PKCS#8 RSA private key. The key was not printed.",
    );
  }
  const pub: Record<string, string> = {
    kty: String(jwk.kty ?? ""),
    n: String(jwk.n ?? ""),
    e: String(jwk.e ?? ""),
    alg: "RS384",
    use: "sig",
    kid,
  };
  for (const field of PRIVATE_FIELDS) {
    if (field in pub) {
      throw new Error(
        "Refusing to print a JWKS that contains private key material.",
      );
    }
  }
  if (!pub.kty || !pub.n || !pub.e || pub.n === "undefined") {
    throw new Error("Could not derive a public JWKS from the private key.");
  }
  return { keys: [pub] };
}

async function main(): Promise<void> {
  const [pemPath, kid] = process.argv.slice(2);
  if (!pemPath || !kid) {
    throw new Error(
      "Usage: npx tsx scripts/print-sandbox-jwks.ts <private-key.pem> <kid>",
    );
  }
  let pem: string;
  try {
    pem = readFileSync(pemPath, "utf8");
  } catch {
    throw new Error(
      "Could not read the private key file. The path's contents were not printed.",
    );
  }
  const jwks = await publicJwks(pem, kid);
  process.stdout.write(`${JSON.stringify(jwks, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Could not print a JWKS.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
