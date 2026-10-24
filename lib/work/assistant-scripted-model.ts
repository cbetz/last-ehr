import { randomUUID } from "node:crypto";
import { MockLanguageModelV3 } from "ai/test";

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** Explicit no-network CI fixture. This is not a language model or a real-provider acceptance run. */
export function createWorkScriptedModel() {
  return new MockLanguageModelV3({
    provider: "lastehr-scripted-test", modelId: "synthetic-work-fixture",
    doGenerate: async ({ prompt }) => {
      let context: { observation: { reference: string; versionId: string; value: number; unit: string; label: string } } | undefined;
      for (const message of prompt) {
        if (message.role !== "tool") continue;
        for (const part of message.content) {
          if (part.type === "tool-result" && part.toolName === "read_chart_context" && part.output.type === "json") {
            const value = part.output.value as { untrustedChartData?: typeof context };
            context = value.untrustedChartData;
          }
        }
      }
      const input = context ? {
        description: `Contact the synthetic patient to arrange follow-up of ${context.observation.label} ${context.observation.value}${context.observation.unit}.`,
        dueDate: "2026-11-01", sourceReference: context.observation.reference, sourceVersionId: context.observation.versionId,
      } : {};
      return {
        content: [{ type: "tool-call" as const, toolCallId: randomUUID(), toolName: context ? "propose_follow_up" : "read_chart_context", input: JSON.stringify(input) }],
        finishReason: { unified: "tool-calls" as const, raw: "scripted-test" }, usage, warnings: [],
      };
    },
  });
}
