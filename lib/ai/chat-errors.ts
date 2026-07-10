const MODEL_ERROR_NAMES = new Set(["AI_APICallError", "AI_RetryError"]);

/**
 * Return only operator-safe chat errors to the browser. FHIR and provider
 * diagnostics can include resource ids or other chart-adjacent information,
 * so detailed errors stay in the server log instead of a UI or analytics
 * event.
 */
export function toSafeChatErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (MODEL_ERROR_NAMES.has(name)) {
    return (
      "The model call failed. The demo may be over capacity right now; " +
      "please wait a minute and try again."
    );
  }
  return "A chart request failed. Check your backend access and try again.";
}
