import { z } from "zod";

/**
 * The manifest is the driver interface: the implementer declares each
 * write tool's name, a valid argument template, and how to find the write
 * on the chart. The suite never guesses tool semantics — guessing would
 * make a pass meaningless.
 *
 * Template placeholders in argument string values:
 * - "$PATIENT_ID" (exact) — replaced with the synthetic patient's id.
 * - "$NONCE" (exact) — replaced with a run-unique NUMBER (for numeric
 *   fields like an observation value).
 * - "$NONCE" (embedded in longer text) — replaced textually, keeping the
 *   value a string (for free-text fields).
 */
const writeToolSchema = z.object({
  name: z.string().min(1).max(128),
  arguments: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
  /** Resource type the approved write creates, e.g. "Observation". */
  creates: z.string().min(1).max(64),
  /** Dot path of the patient reference in the created resource. */
  patientReferencePath: z.string().min(1).max(128),
  /** Argument key whose (nonced) value identifies this run's write. */
  nonceField: z.string().min(1).max(64),
});

const manifestSchema = z.object({
  writeTools: z.array(writeToolSchema).min(1),
  /** v0.1 supports only the default result parser: JSON text {saved, id?}. */
  parseResult: z.literal("default").default("default"),
});

export type WriteToolManifest = z.infer<typeof writeToolSchema>;
export type ConformanceManifest = z.infer<typeof manifestSchema>;

export function parseManifest(raw: unknown): ConformanceManifest {
  return manifestSchema.parse(raw);
}

export type SubstitutedArguments = {
  args: Record<string, unknown>;
  nonce: number;
};

export function substituteArguments(
  tool: WriteToolManifest,
  patientId: string,
  nonce: number,
): SubstitutedArguments {
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tool.arguments)) {
    if (value === "$PATIENT_ID") {
      args[key] = patientId;
    } else if (value === "$NONCE") {
      args[key] = nonce;
    } else if (typeof value === "string" && value.includes("$NONCE")) {
      args[key] = value.replaceAll("$NONCE", String(nonce));
    } else {
      args[key] = value;
    }
  }
  return { args, nonce };
}

/**
 * The default result contract: the tool returns JSON text whose object has
 * a boolean `saved` and, when saved, the server-assigned id (the shape
 * @lastehr/mcp ships; declared non-normative in spec v0.1).
 */
export function parseDefaultResult(text: string): {
  saved: boolean | undefined;
  id: string | undefined;
} {
  try {
    const parsed = JSON.parse(text) as { saved?: unknown; id?: unknown };
    return {
      saved: typeof parsed.saved === "boolean" ? parsed.saved : undefined,
      id: typeof parsed.id === "string" ? parsed.id : undefined,
    };
  } catch {
    return { saved: undefined, id: undefined };
  }
}
