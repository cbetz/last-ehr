import type { Resource } from "@medplum/fhirtypes";

import type { VendorReadBackTolerance } from "./sandbox-profile.js";

const MAX_DIFF_CHARS = 12_000;
const MAX_LINE = 300;

export type ReadBackReport = {
  matched: boolean;
  diff: string;
};

export const DEFAULT_READ_BACK_TOLERANCE: VendorReadBackTolerance = {
  ignoreAddedCodings: false,
  ignoreValueQuantityExtensions: false,
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCodingArray(value: unknown): value is JsonObject[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isObject(item) &&
        typeof item.code === "string" &&
        !("reference" in item) &&
        !("coding" in item),
    )
  );
}

function same(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") {
    return Object.is(left, right);
  }
  return left === right;
}

function clip(line: string): string {
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line;
}

function extensionUrls(value: unknown): string {
  if (!Array.isArray(value)) return "extension";
  const urls = value
    .map((item) => (isObject(item) && typeof item.url === "string" ? item.url : ""))
    .filter(Boolean);
  return urls.join(", ") || "extension";
}

function compare(
  sent: unknown,
  persisted: unknown,
  path: string,
  issues: string[],
  additions: string[],
  tolerance: VendorReadBackTolerance,
): void {
  if (
    Array.isArray(sent) &&
    Array.isArray(persisted) &&
    isCodingArray(sent) &&
    isCodingArray(persisted)
  ) {
    for (const coding of sent) {
      const found = persisted.some(
        (row) => row.system === coding.system && row.code === coding.code,
      );
      if (!found) {
        issues.push(
          clip(
            `missing coding at ${path}: ${String(coding.system)}|${String(coding.code)}`,
          ),
        );
      }
    }
    for (const coding of persisted) {
      const found = sent.some(
        (row) => row.system === coding.system && row.code === coding.code,
      );
      if (found) continue;
      const line = clip(
        `coding at ${path}: ${String(coding.system)}|${String(coding.code)}`,
      );
      if (tolerance.ignoreAddedCodings) additions.push(line);
      else issues.push(`server added ${line}`);
    }
    return;
  }

  if (Array.isArray(sent) && Array.isArray(persisted)) {
    const count = Math.max(sent.length, persisted.length);
    for (let index = 0; index < count; index += 1) {
      const at = `${path}[${index}]`;
      if (index >= sent.length) additions.push(`extra ${at}`);
      else if (index >= persisted.length) issues.push(`missing ${at}`);
      else {
        compare(sent[index], persisted[index], at, issues, additions, tolerance);
      }
    }
    return;
  }

  if (isObject(sent) && isObject(persisted)) {
    for (const key of Object.keys(sent)) {
      const next = path ? `${path}.${key}` : key;
      if (!(key in persisted)) issues.push(`missing ${next}`);
      else compare(sent[key], persisted[key], next, issues, additions, tolerance);
    }
    for (const key of Object.keys(persisted)) {
      if (key in sent) continue;
      if (path === "" && (key === "id" || key === "meta")) continue;
      const next = path ? `${path}.${key}` : key;
      if (key === "extension" && path.endsWith("valueQuantity")) {
        const urls = extensionUrls(persisted[key]);
        if (tolerance.ignoreValueQuantityExtensions) {
          additions.push(`valueQuantity extension ignored: ${urls}`);
        } else {
          issues.push(`valueQuantity extension was not sent: ${urls}`);
        }
        continue;
      }
      additions.push(next);
    }
    return;
  }

  if (!same(sent, persisted)) {
    issues.push(
      clip(
        `${path}: sent ${JSON.stringify(sent)} persisted ${JSON.stringify(persisted)}`,
      ),
    );
  }
}

/**
 * Compare the resource we posted with the one the server stored.
 * Server-added id and meta are omitted. Vendor tolerance decides whether
 * extra codings and quantity-translation extensions count as a mismatch.
 * The report is path-level, not a dump of either resource.
 */
export function diffSentVsPersisted(
  sent: Resource,
  persisted: Resource,
  tolerance: VendorReadBackTolerance = DEFAULT_READ_BACK_TOLERANCE,
): ReadBackReport {
  const issues: string[] = [];
  const additions: string[] = [];
  compare(sent, persisted, "", issues, additions, tolerance);
  const id =
    typeof persisted.id === "string" && persisted.id
      ? persisted.id
      : "unknown";
  const lines = [`Read-back ${persisted.resourceType ?? sent.resourceType}/${id}`];
  if (issues.length === 0) lines.push("Matches the approved write.");
  else {
    lines.push("Differs from the approved write:");
    lines.push(...issues.map((issue) => `- ${issue}`));
  }
  if (additions.length > 0) {
    lines.push("Server additions:");
    lines.push(...additions.map((addition) => `- ${addition}`));
  }
  let diff = lines.join("\n");
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n… diff truncated`;
  }
  return { matched: issues.length === 0, diff };
}

export function readBackFailureDiff(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode: unknown }).statusCode
      : undefined;
  if (typeof status === "number") {
    return `Read-back failed (HTTP ${status}). The create was already accepted. The persisted resource was not compared.`;
  }
  return "Read-back failed. The create was already accepted. The persisted resource was not compared.";
}
