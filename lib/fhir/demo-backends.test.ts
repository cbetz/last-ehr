import { describe, it, expect } from "vitest";

import {
  parseDemoBackendEntries,
  parseDemoBackends,
  resolveDemoBackend,
} from "@/lib/fhir/demo-backends";

describe("parseDemoBackends", () => {
  it("parses id|label pairs for demo-eligible backends", () => {
    expect(parseDemoBackends("medplum|Medplum,hapi|HAPI FHIR")).toEqual([
      { id: "medplum", label: "Medplum" },
      { id: "hapi", label: "HAPI FHIR" },
    ]);
  });

  it("falls back to the id when the label is missing", () => {
    expect(parseDemoBackends("medplum")).toEqual([
      { id: "medplum", label: "medplum" },
    ]);
  });

  it("drops ids outside the code-level eligibility gate", () => {
    // firely stays ineligible (shared public sandbox); unknown ids and
    // typos must never become picker options. aidbox (2026-07-18) and
    // oystehr (2026-07-21) are eligible: operator-owned targets verified
    // with the isolation clause.
    expect(
      parseDemoBackends(
        "medplum|Medplum,firely|Firely,aidbox|Aidbox,oystehr|Oystehr,openemr",
      ),
    ).toEqual([
      { id: "medplum", label: "Medplum" },
      { id: "aidbox", label: "Aidbox" },
      { id: "oystehr", label: "Oystehr" },
    ]);
  });

  it("collapses duplicate ids to the first entry", () => {
    expect(parseDemoBackends("hapi|HAPI A,hapi|HAPI B,medplum")).toEqual([
      { id: "hapi", label: "HAPI A" },
      { id: "medplum", label: "medplum" },
    ]);
  });

  it("tolerates whitespace and empty entries", () => {
    expect(parseDemoBackends(" medplum|Medplum ,, hapi ,|")).toEqual([
      { id: "medplum", label: "Medplum" },
      { id: "hapi", label: "hapi" },
    ]);
  });

  it("returns empty for unset or empty env", () => {
    expect(parseDemoBackends(undefined)).toEqual([]);
    expect(parseDemoBackends("")).toEqual([]);
  });
});

describe("parseDemoBackendEntries", () => {
  it("keeps ineligible and unknown entries, flagged, for the check script", () => {
    expect(parseDemoBackendEntries("firely|Firely,openemr|OpenEMR")).toEqual([
      { id: "firely", label: "Firely", known: true, eligible: false },
      { id: "openemr", label: "OpenEMR", known: false, eligible: false },
    ]);
  });
});

describe("resolveDemoBackend", () => {
  const allow = parseDemoBackends("medplum|Medplum,hapi|HAPI");

  it("honors a listed backend", () => {
    expect(resolveDemoBackend("hapi", allow)).toBe("hapi");
  });

  it("silently ignores unlisted backends (no probing signal)", () => {
    expect(resolveDemoBackend("firely", allow)).toBeUndefined();
    expect(resolveDemoBackend("not-a-backend", allow)).toBeUndefined();
  });

  it("ignores a missing header", () => {
    expect(resolveDemoBackend(null, allow)).toBeUndefined();
  });

  it("honors nothing when the allowlist is empty", () => {
    expect(resolveDemoBackend("medplum", [])).toBeUndefined();
  });
});
