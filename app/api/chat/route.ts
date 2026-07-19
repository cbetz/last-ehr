import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  type UIMessage,
  type InferUITools,
} from "ai";
import { cookies } from "next/headers";

import { getChatModel, isScriptedDemoEnabled } from "@/lib/ai/model";
import {
  toSafeChatErrorLog,
  toSafeChatErrorMessage,
} from "@/lib/ai/chat-errors";
import { parseDemoModels, resolveDemoModel } from "@/lib/ai/demo-models";
import { buildTools, SYSTEM_PROMPT } from "@/lib/ai/tools";
import { findDeniedProposals, recordRejectedProposal } from "@/lib/fhir/audit";
import { createFhirBackend, hasFhirBackendConfig } from "@/lib/fhir/backend";
import {
  parseDemoBackends,
  resolveDemoBackend,
} from "@/lib/fhir/demo-backends";
import { ObservedFhirBackend, type FhirDevEvent } from "@/lib/fhir/observed";
import { ScriptedDemoBackend } from "@/lib/fhir/scripted-demo";
import { checkRateLimit, getClientIp } from "@/lib/utils/rate-limit";

// Node runtime so @medplum/core works; allow time for the multi-step tool loop.
export const runtime = "nodejs";
export const maxDuration = 30;

export type ChatTools = InferUITools<ReturnType<typeof buildTools>>;
// Dev-output data parts ("data-fhir", "data-backend"): streamed transient —
// they reach useChat's onData but are never persisted into message.parts, so
// the client never re-POSTs them in the conversation history.
export type DemoDevData = {
  fhir: FhirDevEvent;
  backend: { name: string };
};
export type ChatMessage = UIMessage<never, DemoDevData, ChatTools>;

// Error bodies double as the user-facing message: the useChat transport turns
// a non-OK response body into error.message, and the client shows any message
// matching these openings verbatim (see errorText in demo-chat.tsx).
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("medplum_access_token")?.value;
  if (!accessToken) {
    return new Response(
      "Your demo session expired. Refresh the page to start a new one.",
      { status: 401 },
    );
  }

  // Protect the public demo from a traffic spike / abuse: cap requests per IP
  // (and globally, to bound model spend). See lib/utils/rate-limit.ts.
  const { success, resetAfter } = await checkRateLimit(getClientIp(req));
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil(resetAfter / 1000));
    return new Response(
      "Rate limit reached. To keep this demo up for everyone, requests are " +
        "capped per visitor and overall. Please wait a minute and try again.",
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }

  // Tags demo writes so a visitor sees seed data + only their own edits.
  const sessionId = cookieStore.get("demo_session_id")?.value;

  let messages: UIMessage[];
  try {
    ({ messages } = (await req.json()) as { messages: UIMessage[] });
  } catch {
    return new Response("Invalid request body.", { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Invalid request body.", { status: 400 });
  }

  // Optional demo model picker: the header is honored only for allowlisted
  // ids on aggregator providers; anything else falls back to MODEL_ID.
  const demoModel = resolveDemoModel(
    req.headers.get("x-demo-model"),
    parseDemoModels(process.env.NEXT_PUBLIC_DEMO_MODELS),
  );

  // Optional demo backend picker, mirroring the model picker above: honored
  // ONLY for demo sessions (demo_session_id present — SMART and signed-in
  // sessions never carry it) and never under the scripted gate, which is
  // pinned to local HAPI. An allowlisted pick whose server config is
  // incomplete degrades like an unlisted name: silent fallback to the
  // deployment default, so probing yields no signal and a misconfigured
  // entry cannot 500.
  const requestedBackend =
    sessionId && !isScriptedDemoEnabled()
      ? resolveDemoBackend(
          req.headers.get("x-demo-backend"),
          parseDemoBackends(process.env.NEXT_PUBLIC_DEMO_BACKENDS),
        )
      : undefined;
  const demoBackend =
    requestedBackend && hasFhirBackendConfig(requestedBackend)
      ? requestedBackend
      : undefined;

  const backend = createFhirBackend(accessToken, demoBackend);

  // Dev output is an explicit, bounded carve-out from the scrubbing policy
  // (docs/threat-model.md): opt-in env flag, demo sessions only. SMART and
  // signed-in sessions never carry demo_session_id, so they never stream
  // FHIR detail regardless of the flag.
  const devOutput =
    process.env.NEXT_PUBLIC_DEMO_DEV_OUTPUT === "true" && Boolean(sessionId);

  // Opt-in rejected-proposal audit trail. Uses the deployment-default
  // backend, never the visitor-picked one: the audit trail is the operator's
  // record and must not be re-pointed (or fragmented) by the demo picker.
  // It is also the raw backend, not the scripted wrapper: AuditEvents are
  // system writes, not agent tool writes, so they are outside the scripted
  // demo's narrowed write surface. Audit failures are logged and never block
  // the chat turn.
  if (process.env.LASTEHR_AUDIT_REJECTED_PROPOSALS === "true") {
    for (const denial of findDeniedProposals(messages)) {
      try {
        // Constructed inside the try so a broken deployment default degrades
        // to a logged audit failure (matching the invariant below) instead
        // of failing a turn the picked backend could have carried.
        const auditBackend = demoBackend
          ? createFhirBackend(accessToken)
          : backend;
        await recordRejectedProposal(auditBackend, denial, sessionId);
      } catch (error) {
        console.error(
          "Rejected-proposal audit failed:",
          toSafeChatErrorLog(error),
        );
      }
    }
  }

  const modelMessages = await convertToModelMessages(messages);

  // Errors must be scrubbed before they stream: a backend error can contain
  // a resource id or other chart-adjacent detail, and provider errors embed
  // the full request body (messages + chart context), which must reach
  // neither the browser nor hosted logs. The scrubber goes in EVERY onError
  // seat: toUIMessageStream(Response) stringifies mid-stream streamText
  // failures through its OWN onError (default: raw error.message), while
  // createUIMessageStream's onError only covers errors thrown by execute or
  // a rejected merged read.
  const scrubStreamError = (error: unknown): string => {
    console.error("Chat stream error:", toSafeChatErrorLog(error));
    return toSafeChatErrorMessage(error);
  };

  // Resolved before any stream exists so a config error (unknown provider,
  // bedrock without MODEL_ID) fails the request loudly instead of streaming
  // a 200 with an error part.
  const model = getChatModel(demoModel);

  if (!devOutput) {
    // Byte-identical response tail to the pre-dev-output route. This is
    // load-bearing, not a stylistic branch: createUIMessageStream stamps a
    // server-generated messageId onto the 'start' chunk, which the approval
    // auto-resend turn must NOT carry unless it continues the last
    // assistant message — see the originalMessages note below.
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      tools: buildTools(
        isScriptedDemoEnabled()
          ? new ScriptedDemoBackend(backend, sessionId)
          : backend,
        sessionId,
        // The scripted wrapper's fixed write surface has no Provenance, so
        // the opt-in emission is pinned off rather than logging a spurious
        // failure per approved write.
        isScriptedDemoEnabled() ? { writeProvenance: false } : {},
      ),
      stopWhen: stepCountIs(5),
      // Client disconnect / Stop aborts the model call and the tool loop
      // instead of letting the full step budget run against the chart.
      abortSignal: req.signal,
    });
    return result.toUIMessageStreamResponse({ onError: scrubStreamError });
  }

  const stream = createUIMessageStream<ChatMessage>({
    // Continuation identity: without originalMessages, createUIMessageStream
    // stamps a FRESH messageId on every 'start' chunk, so the approval
    // auto-resend (which continues the last assistant message) would push a
    // duplicate assistant message client-side instead of updating in place —
    // the original card freezes as a pending skeleton and the next POST
    // carries a dangling duplicate tool call. With originalMessages, resume
    // turns reuse the last assistant message's id.
    originalMessages: messages as ChatMessage[],
    execute: ({ writer }) => {
      // The observer wraps the RAW backend, inside the scripted wrapper, so
      // in scripted mode the panel shows the calls actually forwarded to the
      // chart. The audit writer above stays unobserved — and so does the
      // opt-in write-Provenance emitter (provenanceBackend below): system
      // writes are not part of the agent-reachable surface the panel
      // documents.
      const observed = new ObservedFhirBackend(
        backend,
        (event) =>
          writer.write({ type: "data-fhir", data: event, transient: true }),
        sessionId,
      );
      const toolBackend = isScriptedDemoEnabled()
        ? new ScriptedDemoBackend(observed, sessionId)
        : observed;
      // The resolved (post-fallback) backend, so the panel is server truth.
      writer.write({
        type: "data-backend",
        data: { name: demoBackend ?? (process.env.FHIR_BACKEND || "medplum") },
        transient: true,
      });

      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: modelMessages,
        tools: buildTools(toolBackend, sessionId, {
          ...(isScriptedDemoEnabled() ? { writeProvenance: false } : {}),
          provenanceBackend: backend,
        }),
        stopWhen: stepCountIs(5),
        // createUIMessageStream's outer stream does not propagate the
        // response cancellation into merged streams, so the request signal
        // is the only thing that stops the model + tool loop on disconnect.
        abortSignal: req.signal,
      });
      writer.merge(result.toUIMessageStream({ onError: scrubStreamError }));
    },
    onError: scrubStreamError,
  });

  return createUIMessageStreamResponse({ stream });
}
