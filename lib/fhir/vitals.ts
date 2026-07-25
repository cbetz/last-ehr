/**
 * A pinned, local coding table for agent-written observations.
 *
 * Two problems it solves. Without a LOINC `coding`, an agent-written vital
 * is a free-text row that no chart view can trend and no US Core validator
 * accepts. And without a real UCUM code, `Quantity.code` was being set to
 * whatever unit string a human typed — asserting that "bpm" or "beats/min"
 * is a UCUM code, which they are not (the UCUM code for both is `/min`).
 *
 * Deliberately a local table rather than a terminology server ($expand /
 * $validate-code): the mapping stays visible in the approval card, the
 * write path gains no network dependency it could fail closed on, and the
 * reviewer sees the exact code that will save. The table is small on
 * purpose — an unrecognized label or unit degrades to honest free text
 * instead of guessing a code.
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
