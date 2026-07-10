import { describe, expect, it } from "vitest";

import { toSafeChatErrorMessage } from "@/lib/ai/chat-errors";

describe("toSafeChatErrorMessage", () => {
  it("returns a retryable message for model-provider failures", () => {
    const error = new Error("provider quota detail");
    error.name = "AI_APICallError";

    expect(toSafeChatErrorMessage(error)).toContain("The model call failed");
  });

  it("does not expose FHIR diagnostics to the browser", () => {
    const error = new Error("Patient/secret-id: access denied");

    expect(toSafeChatErrorMessage(error)).toBe(
      "A chart request failed. Check your backend access and try again.",
    );
  });
});
