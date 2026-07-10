import { randomUUID } from "node:crypto";

import { stepCountIs, streamText } from "ai";
import { describe, expect, it } from "vitest";

import { getChatModel, isScriptedDemoEnabled } from "@/lib/ai/model";
import { buildTools, SYSTEM_PROMPT } from "@/lib/ai/tools";
import { createFhirBackend } from "@/lib/fhir/backend";
import { ScriptedDemoBackend } from "@/lib/fhir/scripted-demo";
import {
  SCRIPTED_DEMO_PATIENT_KEY,
  SYNTHETIC_SYSTEM,
} from "@/lib/fhir/synthetic";

// This deliberately remains opt-in: the default unit suite must not require
// Docker. CI sets RUN_HAPI_E2E=1 after `demo:local:prepare` has seeded HAPI.
const runHapiE2E = process.env.RUN_HAPI_E2E === "1";

describe.skipIf(!runHapiE2E)("scripted local HAPI approval flow", () => {
  it(
    "searches the seeded record, pauses before the write, then saves only after approval",
    async () => {
      expect(isScriptedDemoEnabled()).toBe(true);

      const backend = createFhirBackend("local-fhir");
      const [maria] = await backend.searchResources("Patient", {
        identifier: `${SYNTHETIC_SYSTEM}|${SCRIPTED_DEMO_PATIENT_KEY}`,
        _count: "1",
      });
      expect(maria?.id).toBeTruthy();
      if (!maria?.id) {
        throw new Error("The seeded Maria Garcia record was not found.");
      }
      const mariaId = maria.id;

      const sessionId = randomUUID();
      const sessionTag = `session-${sessionId}`;
      const tools = buildTools(
        new ScriptedDemoBackend(backend, sessionId),
        sessionId,
      );
      const sessionObservations = async () =>
        (
          await backend.searchResources("Observation", {
            patient: mariaId,
            _count: "100",
          })
        ).filter((observation) =>
          observation.meta?.tag?.some(
            (tag) =>
              tag.system === "http://lastehr.demo" && tag.code === sessionTag,
          ),
        );

      const first = streamText({
        model: getChatModel(),
        system: SYSTEM_PROMPT,
        prompt: "Run the local scripted approval demo.",
        tools,
        stopWhen: stepCountIs(5),
      });
      const firstContent = await first.content;
      const firstResponse = await first.response;
      const approval = firstContent.find(
        (part) => part.type === "tool-approval-request",
      );

      expect(approval).toBeDefined();
      if (!approval || approval.type !== "tool-approval-request") {
        throw new Error("The scripted demo did not request write approval.");
      }
      expect(approval.toolCall.toolName).toBe("record_observation");
      expect(approval.toolCall.input).toEqual({
        patientId: mariaId,
        label: "Heart rate",
        value: 72,
        unit: "bpm",
      });
      expect(await sessionObservations()).toHaveLength(0);

      const second = streamText({
        model: getChatModel(),
        system: SYSTEM_PROMPT,
        tools,
        stopWhen: stepCountIs(5),
        messages: [
          { role: "user", content: "Run the local scripted approval demo." },
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

      expect(await second.text).toBe(
        "The scripted observation was saved after approval.",
      );

      const created = await sessionObservations();
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        resourceType: "Observation",
        status: "final",
        code: { text: "Heart rate" },
        subject: { reference: `Patient/${mariaId}` },
        valueQuantity: {
          value: 72,
          unit: "bpm",
          system: "http://unitsofmeasure.org",
          code: "bpm",
        },
        meta: {
          tag: [{ system: "http://lastehr.demo", code: sessionTag }],
        },
      });
    },
    60_000,
  );
});
