import { MedplumClient } from "@medplum/core";

import type { McpRuntimeConfig } from "./config.js";

export async function createMedplumClient(
  config: McpRuntimeConfig,
  fetchFn: typeof globalThis.fetch = fetch,
): Promise<MedplumClient> {
  try {
    // The token goes in the constructor so Medplum does not resume a stored
    // login over it. A resumed session would call FHIR as someone other than
    // the configured credential.
    const medplum = new MedplumClient({
      baseUrl: config.baseUrl,
      fetch: fetchFn,
      ...(config.accessToken ? { accessToken: config.accessToken } : {}),
    });
    if (!config.accessToken) {
      await medplum.startClientLogin(
        config.clientId as string,
        config.clientSecret as string,
      );
    }
    return medplum;
  } catch {
    throw new Error(
      "Could not authenticate with Medplum. Verify the configured credentials and access policy.",
    );
  }
}
