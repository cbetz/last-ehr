export function getGoogleClientId(
  clientId: string | undefined
): string | undefined {
  if (clientId) {
    return clientId;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.protocol + "//" + window.location.host;
    const authorizedOrigins =
      process.env.NEXT_PUBLIC_GOOGLE_AUTH_ORIGINS?.split(",") ?? [];
    if (authorizedOrigins.includes(origin)) {
      return process.env.NEXT_PUBLIC_MEDPLUM_GOOGLE_CLIENT_ID;
    }
  }

  return undefined;
}
