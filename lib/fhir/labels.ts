/**
 * Standard first-level AI-transparency label (HL7 AI Transparency on FHIR
 * IG): agent-written resources are marked "Artificial Intelligence
 * asserted" in meta.security. Lives here (not in lib/ai) so safety
 * wrappers in lib/fhir can stamp it without depending on the tool layer.
 */
export const AIAST_LABEL = {
  system: "http://terminology.hl7.org/CodeSystem/v3-ObservationValue",
  code: "AIAST",
  display: "Artificial Intelligence asserted",
} as const;

export const PROVENANCE_PARTICIPANT_TYPE =
  "http://terminology.hl7.org/CodeSystem/provenance-participant-type";
