import { describe, expect, it } from "vitest";

import { toSafeChatErrorMessage } from "@/lib/ai/chat-errors";
import { WritePolicyDeniedError } from "@/lib/ai/write-policy";

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

  it("passes policy denials through verbatim — they are operator-safe by construction", () => {
    expect(
      toSafeChatErrorMessage(new WritePolicyDeniedError("Ask an admin.")),
    ).toBe("This write is blocked by deployment policy. Ask an admin.");
  });

  it("scrubs a foreign error that forges the policy error name", () => {
    const forged = new Error("Patient/secret-id: leaked diagnostic");
    forged.name = "WritePolicyDeniedError";

    // Name alone is not enough: without the stable prefix the message is
    // scrubbed like any other error.
    expect(toSafeChatErrorMessage(forged)).toBe(
      "A chart request failed. Check your backend access and try again.",
    );
  });
});
