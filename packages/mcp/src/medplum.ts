import { MedplumClient } from "@medplum/core";

import type { McpRuntimeConfig } from "./config.js";

export async function createMedplumClient(
  config: McpRuntimeConfig,
  fetchFn: typeof globalThis.fetch = fetch,
): Promise<MedplumClient> {
  const medplum = new MedplumClient({
    baseUrl: config.baseUrl,
    fetch: fetchFn,
  });

  try {
    if (config.accessToken) {
      medplum.setAccessToken(config.accessToken);
    } else {
      await medplum.startClientLogin(
        config.clientId as string,
        config.clientSecret as string,
      );
    }
  } catch {
    throw new Error(
      "Could not authenticate with Medplum. Verify the configured credentials and access policy.",
    );
  }

  return medplum;
}
