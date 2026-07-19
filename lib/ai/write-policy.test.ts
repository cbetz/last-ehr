import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateWritePolicy,
  resolveDisabledWriteTools,
  WritePolicyDeniedError,
  type WritePolicyDecision,
} from "./write-policy";

const PROPOSAL = {
  toolName: "add_note",
  resourceType: "Communication",
  patientId: "p1",
};

describe("evaluateWritePolicy (affirmative-permit, fail-closed)", () => {
  it("allows when no policy is configured — the human gate is the policy", async () => {
    await expect(evaluateWritePolicy(undefined, PROPOSAL)).resolves.toEqual({
      deny: false,
    });
  });

  it("allows only an explicit deny:false", async () => {
    await expect(
      evaluateWritePolicy(() => ({ deny: false }), PROPOSAL),
    ).resolves.toEqual({ deny: false });
  });

  it("denies with the policy's static reason", async () => {
    await expect(
      evaluateWritePolicy(
        async () => ({ deny: true, reason: "Notes are disabled after hours." }),
        PROPOSAL,
      ),
    ).resolves.toEqual({
      deny: true,
      reason: "Notes are disabled after hours.",
    });
  });

  it("denies on a throwing policy, with no reason leaked from the error", async () => {
    await expect(
      evaluateWritePolicy(() => {
        throw new Error("secret diagnostic");
      }, PROPOSAL),
    ).resolves.toEqual({ deny: true });
  });

  it("denies on malformed results — undefined, empty, or non-boolean deny", async () => {
    for (const malformed of [
      undefined,
      null,
      {},
      { deny: "no" },
      { allowed: true },
    ]) {
      await expect(
        evaluateWritePolicy(
          () => malformed as unknown as WritePolicyDecision,
          PROPOSAL,
        ),
      ).resolves.toMatchObject({ deny: true });
    }
  });
});

describe("WritePolicyDeniedError", () => {
  it("carries the stable prefix so the demo UI shows it verbatim", () => {
    expect(new WritePolicyDeniedError().message).toBe(
      "This write is blocked by deployment policy.",
    );
    expect(new WritePolicyDeniedError("Ask an administrator.").message).toBe(
      "This write is blocked by deployment policy. Ask an administrator.",
    );
    expect(new WritePolicyDeniedError().name).toBe("WritePolicyDeniedError");
  });
});

describe("resolveDisabledWriteTools", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to nothing disabled", () => {
    expect(resolveDisabledWriteTools().size).toBe(0);
  });

  it("parses the env list", () => {
    vi.stubEnv("LASTEHR_WRITE_TOOLS_DISABLED", "add_note");
    expect([...resolveDisabledWriteTools()]).toEqual(["add_note"]);
    vi.stubEnv("LASTEHR_WRITE_TOOLS_DISABLED", " add_note , record_observation ");
    expect(resolveDisabledWriteTools().size).toBe(2);
  });

  it("rejects unknown names loudly — a typo'd disable must not fail open", () => {
    vi.stubEnv("LASTEHR_WRITE_TOOLS_DISABLED", "add-note");
    expect(() => resolveDisabledWriteTools()).toThrow(
      /Unknown write tool name.*add-note/,
    );
  });

  it("prefers an explicit override to the env", () => {
    vi.stubEnv("LASTEHR_WRITE_TOOLS_DISABLED", "add_note");
    expect(resolveDisabledWriteTools([]).size).toBe(0);
  });
});
