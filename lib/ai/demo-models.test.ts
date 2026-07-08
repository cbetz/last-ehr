import { describe, it, expect } from "vitest";

import { parseDemoModels, resolveDemoModel } from "@/lib/ai/demo-models";

describe("parseDemoModels", () => {
  it("parses id|label pairs", () => {
    expect(
      parseDemoModels(
        "openai/gpt-4.1-mini|GPT-4.1 mini, anthropic/claude-haiku-4.5|Claude Haiku",
      ),
    ).toEqual([
      { id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku" },
    ]);
  });

  it("falls back to the id when the label is missing", () => {
    expect(parseDemoModels("openai/gpt-4.1-mini")).toEqual([
      { id: "openai/gpt-4.1-mini", label: "openai/gpt-4.1-mini" },
    ]);
  });

  it("tolerates whitespace, empty entries, and stray pipes", () => {
    expect(parseDemoModels(" a|A ,, b , c|C|extra ,|")).toEqual([
      { id: "a", label: "A" },
      { id: "b", label: "b" },
      { id: "c", label: "C|extra" },
    ]);
  });

  it("returns empty for unset or empty env", () => {
    expect(parseDemoModels(undefined)).toEqual([]);
    expect(parseDemoModels("")).toEqual([]);
  });
});

describe("resolveDemoModel", () => {
  const allow = parseDemoModels("a|A,b|B");

  it("honors a listed model on aggregator providers", () => {
    expect(resolveDemoModel("a", "gateway", allow)).toBe("a");
    expect(resolveDemoModel("b", "openrouter", allow)).toBe("b");
  });

  it("silently ignores unlisted models (no probing signal)", () => {
    expect(resolveDemoModel("gpt-5-pro", "gateway", allow)).toBeUndefined();
  });

  it("ignores the header entirely on native providers", () => {
    expect(resolveDemoModel("a", "openai", allow)).toBeUndefined();
    expect(resolveDemoModel("a", "anthropic", allow)).toBeUndefined();
  });

  it("ignores a missing header", () => {
    expect(resolveDemoModel(null, "gateway", allow)).toBeUndefined();
  });
});
