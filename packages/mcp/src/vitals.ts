/**
 * Copy of lib/fhir/vitals.ts, kept byte-identical below the header.
 *
 * @lastehr/mcp publishes standalone, so it cannot import from the app. The
 * duplication is guarded by a test that runs codeObservation from BOTH
 * modules over a matrix of labels and units and asserts identical output —
 * if either side drifts, that test fails rather than the two bindings
 * quietly coding writes differently.
 */

export const LOINC_SYSTEM = "http://loinc.org";
export const UCUM_SYSTEM = "http://unitsofmeasure.org";
export const OBSERVATION_CATEGORY_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/observation-category";

/**
 * Standard HL7 R4 extension (context Observation, 0..*,
 * Reference(Observation)): "This observation replaces a previous
 * observation (i.e. a revised value)." HL7's own comment names it as "an
 * alternative to updating the Observation with a new version with status =
 * 'amended' or 'corrected'" — which is precisely why it fits a protocol
 * whose v0.1 permits creates only.
 */
export const OBSERVATION_REPLACES_EXTENSION =
  "http://hl7.org/fhir/StructureDefinition/observation-replaces";

/** LOINC codes for the vitals a chat agent plausibly records. */
const VITALS: ReadonlyArray<{
  loinc: string;
  display: string;
  /** Lowercased labels that resolve to this code. */
  labels: readonly string[];
}> = [
  { loinc: "8867-4", display: "Heart rate", labels: ["heart rate", "pulse", "hr"] },
  {
    loinc: "9279-1",
    display: "Respiratory rate",
    labels: ["respiratory rate", "respiration rate", "resp rate", "breathing rate"],
  },
  {
    loinc: "8310-5",
    display: "Body temperature",
    labels: ["body temperature", "temperature", "temp"],
  },
  { loinc: "29463-7", display: "Body weight", labels: ["body weight", "weight"] },
  { loinc: "8302-2", display: "Body height", labels: ["body height", "height"] },
  {
    loinc: "8480-6",
    display: "Systolic blood pressure",
    labels: ["systolic blood pressure", "systolic bp", "systolic"],
  },
  {
    loinc: "8462-4",
    display: "Diastolic blood pressure",
    labels: ["diastolic blood pressure", "diastolic bp", "diastolic"],
  },
  {
    loinc: "59408-5",
    display: "Oxygen saturation in Arterial blood by Pulse oximetry",
    labels: ["oxygen saturation", "o2 saturation", "spo2", "pulse oximetry", "sat"],
  },
  {
    loinc: "39156-5",
    display: "Body mass index (BMI) [Ratio]",
    labels: ["body mass index", "bmi"],
  },
  {
    loinc: "9843-4",
    display: "Head Occipital-frontal circumference",
    labels: ["head circumference", "head occipital-frontal circumference"],
  },
];

/**
 * Human unit strings to UCUM. Resolved independently of the label, because
 * the same measurement legitimately arrives in different units (Celsius or
 * Fahrenheit, kilograms or pounds).
 */
const UNITS: ReadonlyArray<{
  ucum: string;
  /** Lowercased inputs that resolve to this UCUM code. */
  inputs: readonly string[];
}> = [
  { ucum: "/min", inputs: ["/min", "bpm", "beats/min", "beats per minute", "breaths/min", "breaths per minute", "min-1"] },
  { ucum: "mm[Hg]", inputs: ["mm[hg]", "mmhg", "mm hg"] },
  { ucum: "Cel", inputs: ["cel", "c", "°c", "celsius", "degc"] },
  { ucum: "[degF]", inputs: ["[degf]", "f", "°f", "fahrenheit", "degf"] },
  { ucum: "kg", inputs: ["kg", "kgs", "kilogram", "kilograms"] },
  { ucum: "g", inputs: ["g", "gram", "grams"] },
  { ucum: "[lb_av]", inputs: ["[lb_av]", "lb", "lbs", "pound", "pounds"] },
  { ucum: "cm", inputs: ["cm", "centimeter", "centimeters"] },
  { ucum: "m", inputs: ["m", "meter", "meters"] },
  { ucum: "[in_i]", inputs: ["[in_i]", "in", "inch", "inches"] },
  { ucum: "%", inputs: ["%", "percent"] },
  { ucum: "kg/m2", inputs: ["kg/m2", "kg/m^2", "kg/m²"] },
];

const normalize = (value: string) => value.trim().toLowerCase();

export type VitalCoding = { loinc: string; display: string };

/** The LOINC code for a label, or undefined when the label is unrecognized. */
export function resolveVitalCoding(label: string): VitalCoding | undefined {
  const key = normalize(label);
  const hit = VITALS.find((vital) => vital.labels.includes(key));
  return hit ? { loinc: hit.loinc, display: hit.display } : undefined;
}

/** The UCUM code for a unit string, or undefined when unrecognized. */
export function resolveUcumCode(unit: string): string | undefined {
  const key = normalize(unit);
  return UNITS.find((entry) => entry.inputs.includes(key))?.ucum;
}

/**
 * Concepts that are a SET of codes rather than one. A write codes a single
 * measurement, so `resolveVitalCoding` returning one code is right there. A
 * READ has to answer a question, and "what is her blood pressure" is two LOINC
 * codes: searching either one alone silently answers half of it.
 *
 * Every code here is taken from the VITALS table above rather than restated,
 * so a read and a write cannot disagree about what a label means.
 */
const CONCEPT_SETS: ReadonlyArray<{
  labels: readonly string[];
  display: string;
  /** Labels in VITALS, resolved through it — never codes copied by hand. */
  members: readonly string[];
}> = [
  {
    labels: ["blood pressure", "bp", "blood pressure panel"],
    display: "Blood pressure",
    members: ["systolic blood pressure", "diastolic blood pressure"],
  },
];

export type ObservationConcept = {
  /** One or more LOINC codes; a token search ORs them with commas. */
  loinc: readonly string[];
  display: string;
};

/**
 * Resolve a measurement name to the LOINC code set that answers a read.
 * Single vitals come straight from VITALS; multi-code concepts come from
 * CONCEPT_SETS. Undefined when the name is not in either, so a caller can
 * refuse the filter rather than search for a code it invented.
 */
export function resolveObservationConcept(
  label: string,
): ObservationConcept | undefined {
  const set = CONCEPT_SETS.find((entry) => entry.labels.includes(normalize(label)));
  if (set) {
    const members = set.members.map((member) => resolveVitalCoding(member));
    // A member that stopped resolving means the tables drifted apart; refusing
    // beats searching a partial code set and reporting the result as complete.
    if (members.some((member) => !member)) return undefined;
    return {
      loinc: members.map((member) => member!.loinc),
      display: set.display,
    };
  }
  const single = resolveVitalCoding(label);
  return single ? { loinc: [single.loinc], display: single.display } : undefined;
}

/** Every measurement name a read can resolve, for a refusal message. */
export function observationConceptNames(): string[] {
  return [
    ...VITALS.map((vital) => vital.labels[0]),
    ...CONCEPT_SETS.map((set) => set.labels[0]),
  ].sort();
}

export type ObservationCoding = {
  /** CodeableConcept for Observation.code. */
  code: { coding?: { system: string; code: string; display: string }[]; text: string };
  /** Present only for a recognized vital, so category is never guessed. */
  category?: { coding: { system: string; code: string }[] }[];
  /** UCUM code for Quantity.code, absent when the unit is unrecognized. */
  ucum?: string;
};

/**
 * Derive the coded form of an agent-proposed observation. Pure and shared:
 * the write tool builds the resource from this, and the approval card
 * renders the same result, so the reviewer sees the code that will save
 * rather than discovering it on the chart afterwards.
 *
 * An unrecognized label yields `code.text` alone and NO category — better a
 * plainly uncoded row than a guessed classification. An unrecognized unit
 * yields no `ucum`, so the caller omits `Quantity.system`/`code` instead of
 * claiming the typed string is a UCUM code.
 */
export function codeObservation(label: string, unit: string): ObservationCoding {
  const vital = resolveVitalCoding(label);
  const ucum = resolveUcumCode(unit);
  return {
    code: {
      ...(vital
        ? {
            coding: [
              { system: LOINC_SYSTEM, code: vital.loinc, display: vital.display },
            ],
          }
        : {}),
      // The human's own words stay the display text even when coded, so the
      // approval card and the chart show what was actually asked for.
      text: label,
    },
    ...(vital
      ? {
          category: [
            {
              coding: [
                { system: OBSERVATION_CATEGORY_SYSTEM, code: "vital-signs" },
              ],
            },
          ],
        }
      : {}),
    ...(ucum ? { ucum } : {}),
  };
}
