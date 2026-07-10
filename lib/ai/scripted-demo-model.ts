import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

const SCRIPTED_MODEL_ID = "local-synthetic";
const SCRIPTED_PROVIDER = "lastehr-scripted";

const usage = {
  inputTokens: {
    total: 0,
    noCache: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 0,
    text: 0,
    reasoning: 0,
  },
} as const;

type StreamOptions = Parameters<MockLanguageModelV3["doStream"]>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function latestUserMessageIndex(prompt: StreamOptions["prompt"]): number {
  return prompt.reduce(
    (latest, message, index) => (message.role === "user" ? index : latest),
    -1,
  );
}

function latestToolOutput(
  prompt: StreamOptions["prompt"],
  toolName: string,
  afterIndex: number,
): unknown {
  for (let messageIndex = prompt.length - 1; messageIndex > afterIndex; messageIndex--) {
    const message = prompt[messageIndex];
    if (!Array.isArray(message.content)) continue;

    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex--) {
      const part = message.content[partIndex];
      if (part.type === "tool-result" && part.toolName === toolName) {
        return part.output;
      }
    }
  }
  return undefined;
}

function patientIdFromSearch(output: unknown): string | undefined {
  if (!isRecord(output) || output.type !== "json" || !isRecord(output.value)) {
    return undefined;
  }

  const patients = output.value.patients;
  if (!Array.isArray(patients)) return undefined;

  for (const entry of patients) {
    if (!isRecord(entry) || !isRecord(entry.resource)) continue;
    const id = entry.resource.id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return undefined;
}

function wasDenied(output: unknown): boolean {
  return isRecord(output) && output.type === "execution-denied";
}

function toolCall(toolName: string, input: Record<string, unknown>) {
  return [
    {
      type: "tool-call" as const,
      toolCallId: `scripted-${crypto.randomUUID()}`,
      toolName,
      input: JSON.stringify(input),
    },
    {
      type: "finish" as const,
      finishReason: { unified: "tool-calls" as const, raw: "scripted" },
      usage,
    },
  ];
}

function textResponse(text: string) {
  return [
    { type: "text-start" as const, id: "scripted-text" },
    { type: "text-delta" as const, id: "scripted-text", delta: text },
    { type: "text-end" as const, id: "scripted-text" },
    {
      type: "finish" as const,
      finishReason: { unified: "stop" as const, raw: "scripted" },
      usage,
    },
  ];
}

/**
 * A deterministic, no-network model used only for the explicit local HAPI
 * quickstart. It always demonstrates the same synthetic sequence:
 * search Maria Garcia -> propose a heart-rate Observation -> wait for approval
 * -> report the outcome. It is not an LLM and intentionally does not interpret
 * arbitrary chart data or user prompts.
 */
export function createScriptedDemoModel() {
  return new MockLanguageModelV3({
    provider: SCRIPTED_PROVIDER,
    modelId: SCRIPTED_MODEL_ID,
    doStream: async ({ prompt }) => {
      const lastUserIndex = latestUserMessageIndex(prompt);
      const observationOutput = latestToolOutput(
        prompt,
        "record_observation",
        lastUserIndex,
      );

      if (observationOutput !== undefined) {
        return {
          stream: simulateReadableStream({
            chunks: textResponse(
              wasDenied(observationOutput)
                ? "The scripted observation was not saved."
                : "The scripted observation was saved after approval.",
            ),
          }),
        };
      }

      const patientId = patientIdFromSearch(
        latestToolOutput(prompt, "search_patients", lastUserIndex),
      );
      if (patientId) {
        return {
          stream: simulateReadableStream({
            chunks: toolCall("record_observation", {
              patientId,
              label: "Heart rate",
              value: 72,
              unit: "bpm",
            }),
          }),
        };
      }

      return {
        stream: simulateReadableStream({
          chunks: toolCall("search_patients", { name: "Maria Garcia" }),
        }),
      };
    },
  });
}
