import { stepCountIs, streamText, tool } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createScriptedDemoModel } from "@/lib/ai/scripted-demo-model";

async function readParts(prompt: unknown[]) {
  const model = createScriptedDemoModel();
  const result = await model.doStream({ prompt } as Parameters<
    typeof model.doStream
  >[0]);
  const reader = result.stream.getReader();
  const parts: unknown[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

describe("createScriptedDemoModel", () => {
  it("starts the fixed synthetic sequence by searching Maria Garcia", async () => {
    const parts = await readParts([
      { role: "user", content: [{ type: "text", text: "Start demo" }] },
    ]);

    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call",
          toolName: "search_patients",
          input: JSON.stringify({ name: "Maria Garcia" }),
        }),
      ]),
    );
  });

  it("proposes an approval-gated observation for the searched synthetic patient", async () => {
    const parts = await readParts([
      { role: "user", content: [{ type: "text", text: "Start demo" }] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "search-1",
            toolName: "search_patients",
            output: {
              type: "json",
              value: { patients: [{ resource: { id: "maria-1" } }] },
            },
          },
        ],
      },
    ]);

    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call",
          toolName: "record_observation",
          input: JSON.stringify({
            patientId: "maria-1",
            label: "Heart rate",
            value: 72,
            unit: "bpm",
          }),
        }),
      ]),
    );
  });

  it("reports whether the scripted write was approved or denied", async () => {
    const approved = await readParts([
      { role: "user", content: [{ type: "text", text: "Start demo" }] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "observation-1",
            toolName: "record_observation",
            output: { type: "json", value: { id: "observation-1" } },
          },
        ],
      },
    ]);
    const denied = await readParts([
      { role: "user", content: [{ type: "text", text: "Start demo" }] },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "observation-1",
            toolName: "record_observation",
            output: { type: "execution-denied" },
          },
        ],
      },
    ]);

    expect(approved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text-delta",
          delta: "The scripted observation was saved after approval.",
        }),
      ]),
    );
    expect(denied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text-delta",
          delta: "The scripted observation was not saved.",
        }),
      ]),
    );
  });

  it("drives the actual search -> approval -> write tool loop", async () => {
    const searchPatients = vi.fn().mockResolvedValue({
      patients: [{ resource: { id: "maria-1" } }],
    });
    const recordObservation = vi.fn().mockResolvedValue({
      id: "observation-1",
    });
    const tools = {
      search_patients: tool({
        description: "Search synthetic patients.",
        inputSchema: z.object({ name: z.string() }),
        execute: searchPatients,
      }),
      record_observation: tool({
        description: "Record a synthetic observation.",
        inputSchema: z.object({
          patientId: z.string(),
          label: z.string(),
          value: z.number(),
          unit: z.string(),
        }),
        needsApproval: true,
        execute: recordObservation,
      }),
    };

    const first = streamText({
      model: createScriptedDemoModel(),
      tools,
      stopWhen: stepCountIs(5),
      prompt: "Start the local scripted demo.",
    });
    const firstContent = await first.content;
    const firstResponse = await first.response;
    const approval = firstContent.find(
      (part) => part.type === "tool-approval-request",
    );

    expect(searchPatients).toHaveBeenCalledWith(
      { name: "Maria Garcia" },
      expect.anything(),
    );
    expect(recordObservation).not.toHaveBeenCalled();
    expect(approval).toBeDefined();
    if (!approval || approval.type !== "tool-approval-request") {
      throw new Error("Expected a tool approval request");
    }

    const second = streamText({
      model: createScriptedDemoModel(),
      tools,
      stopWhen: stepCountIs(5),
      messages: [
        { role: "user", content: "Start the local scripted demo." },
        ...firstResponse.messages,
        {
          role: "tool",
          content: [
            {
              type: "tool-approval-response",
              approvalId: approval.approvalId,
              approved: true,
            },
          ],
        },
      ],
    });
    const secondText = await second.text;

    expect(recordObservation).toHaveBeenCalledWith(
      {
        patientId: "maria-1",
        label: "Heart rate",
        value: 72,
        unit: "bpm",
      },
      expect.anything(),
    );
    expect(secondText).toBe(
      "The scripted observation was saved after approval.",
    );
  });
});
