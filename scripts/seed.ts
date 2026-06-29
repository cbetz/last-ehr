import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config as loadEnv } from "dotenv";
import { MedplumClient } from "@medplum/core";
import type { Bundle } from "@medplum/fhirtypes";

// Load .env.local then .env so `npm run seed` works after `cp .env.example
// .env.local`. Real shell env always wins (dotenv doesn't override by default).
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

async function main(): Promise<void> {
  const baseUrl = process.env.MEDPLUM_BASE_URL || undefined;
  const accessToken = process.env.MEDPLUM_ACCESS_TOKEN;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!accessToken && !(clientId && clientSecret)) {
    console.error(
      "Seeding needs write access to your Medplum project. Set either:\n" +
        "  - MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET (a ClientApplication with write access), or\n" +
        "  - MEDPLUM_ACCESS_TOKEN (a token from an account that can write).",
    );
    process.exit(1);
  }

  const medplum = new MedplumClient({ baseUrl });
  if (accessToken) {
    medplum.setAccessToken(accessToken);
  } else {
    await medplum.startClientLogin(clientId as string, clientSecret as string);
  }

  const bundlePath = join(
    process.cwd(),
    "scripts",
    "fixtures",
    "synthetic-patients.json",
  );
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as Bundle;

  const result = await medplum.executeBatch(bundle);
  const entries = result.entry ?? [];
  const succeeded = entries.filter((e) =>
    e.response?.status?.startsWith("2"),
  );

  console.log(
    `Seeded ${succeeded.length}/${entries.length} synthetic resources into ${
      baseUrl ?? "Medplum's hosted API"
    }.`,
  );

  if (succeeded.length !== entries.length) {
    for (const e of entries) {
      const status = e.response?.status ?? "(none)";
      if (!status.startsWith("2")) {
        console.warn(`  failed [${status}]: ${JSON.stringify(e.response?.outcome ?? {})}`);
      }
    }
    process.exit(1);
  }

  console.log('Done. Open /demo and ask: "find patients named Smith".');
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
