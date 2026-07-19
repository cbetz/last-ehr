import { WRITE_POLICY_DENIED_PREFIX } from "@/lib/ai/write-policy";

const MODEL_ERROR_NAMES = new Set(["AI_APICallError", "AI_RetryError"]);

/**
 * Return only operator-safe chat errors to the browser. FHIR and provider
 * diagnostics can include resource ids or other chart-adjacent information,
 * so detailed errors stay in the server log instead of a UI or analytics
 * event.
 */
export function toSafeChatErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  // Operator-safe by construction (fixed prefix + static operator-authored
  // reason, no chart data or diagnostics), so the message passes through:
  // a policy denial must read as configuration, not as a backend failure
  // or a human decision. Both the name AND the prefix are required, so a
  // foreign error sharing the name cannot smuggle an arbitrary message.
  if (
    name === "WritePolicyDeniedError" &&
    error instanceof Error &&
    error.message.startsWith(WRITE_POLICY_DENIED_PREFIX)
  ) {
    return error.message;
  }
  if (MODEL_ERROR_NAMES.has(name)) {
    return (
      "The model call failed. The demo may be over capacity right now; " +
      "please wait a minute and try again."
    );
  }
  return "A chart request failed. Check your backend access and try again.";
}

/**
 * Compact, log-safe summary of a chat error: name, message, and status code.
 * Provider errors carry the full request body (messages + chart context) in
 * requestBodyValues; never log the raw object.
 */
export function toSafeChatErrorLog(error: unknown): string {
  const summary =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode: unknown }).statusCode
      : undefined;
  return typeof statusCode === "number"
    ? `${summary} (status ${statusCode})`
    : summary;
}
