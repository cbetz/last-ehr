export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

export function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function stripChartText(value: string): string {
  return value.replace(/<\/?chart_text>/g, "");
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) sorted[key] = sortValue(value[key]);
  }
  return sorted;
}

/** Stable JSON so a field edit changes the fingerprint and key order does not. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sanitizeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "The scenario threw.";
  const cleaned = stripChartText(message).replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 180) || "The scenario threw.";
}

export function referenceOf(value: unknown): string | undefined {
  const record = asRecord(value);
  const reference = record ? stringOf(record.reference) : "";
  return reference.startsWith("Patient/") ? reference : undefined;
}

/** Patient link used by the resource types this benchmark writes or plants. */
export function linkedPatient(resource: Record<string, unknown>): string | undefined {
  return (
    referenceOf(resource.subject) ??
    referenceOf(resource.patient) ??
    referenceOf(resource.for)
  );
}
