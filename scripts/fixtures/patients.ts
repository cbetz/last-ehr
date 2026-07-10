import { SYNTHETIC_SYSTEM } from "../../lib/fhir/synthetic";

export { SYNTHETIC_SYSTEM } from "../../lib/fhir/synthetic";

// Synthetic demo patients. NOT real people or PHI: fake names, addresses, and
// emails throughout. Consumed by `npm run seed`, which wipes and recreates
// these patients in your Medplum project.
//
// Coding choices: conditions carry SNOMED CT and observations carry LOINC
// (recognizable, stable codes). Medications, immunizations, and most allergies
// are text-only CodeableConcepts rather than asserting RxNorm/CVX codes we have
// not verified. Text-only coding is valid FHIR, and the chart reads from `text`.

export type SyntheticCondition = { text: string; snomed?: string };
export type SyntheticMedication = { text: string; dosage: string };
export type SyntheticAllergy = {
  text: string;
  snomed?: string;
  reaction?: string;
  criticality?: "low" | "high";
};
export type SyntheticImmunization = { text: string; date: string };
export type SyntheticObservation = {
  category: "vital-signs" | "laboratory";
  text: string;
  loinc: string;
  value: number;
  unit: string;
  // UCUM code. Omit for units without a clean UCUM form (e.g. eGFR); the human
  // `unit` still displays.
  ucum?: string;
  date: string;
};

export type SyntheticPatient = {
  key: string;
  family: string;
  given: string[];
  gender: "male" | "female";
  birthDate: string;
  email?: string;
  address: { line: string[]; city: string; state: string; postalCode: string };
  conditions: SyntheticCondition[];
  medications: SyntheticMedication[];
  allergies: SyntheticAllergy[];
  immunizations: SyntheticImmunization[];
  observations: SyntheticObservation[];
};

export const patients: SyntheticPatient[] = [
  {
    key: "synthetic-001",
    family: "Smith",
    given: ["John", "A"],
    gender: "male",
    birthDate: "1980-05-14",
    email: "john.smith@example.com",
    address: {
      line: ["123 Fake St"],
      city: "Springfield",
      state: "IL",
      postalCode: "62704",
    },
    conditions: [
      { text: "Essential hypertension", snomed: "59621000" },
      { text: "Hyperlipidemia", snomed: "55822004" },
    ],
    medications: [
      { text: "Lisinopril 10 mg tablet", dosage: "1 tablet once daily" },
      {
        text: "Atorvastatin 20 mg tablet",
        dosage: "1 tablet once daily at bedtime",
      },
    ],
    allergies: [
      {
        text: "Penicillin",
        snomed: "91936005",
        reaction: "Rash",
        criticality: "high",
      },
    ],
    immunizations: [
      { text: "Influenza, seasonal (quadrivalent)", date: "2025-10-20" },
      { text: "Tetanus, diphtheria, pertussis (Tdap)", date: "2023-06-15" },
      { text: "COVID-19 vaccine (mRNA)", date: "2025-09-12" },
    ],
    observations: [
      { category: "vital-signs", text: "Systolic blood pressure", loinc: "8480-6", value: 142, unit: "mmHg", ucum: "mm[Hg]", date: "2026-01-15" },
      { category: "vital-signs", text: "Diastolic blood pressure", loinc: "8462-4", value: 88, unit: "mmHg", ucum: "mm[Hg]", date: "2026-01-15" },
      { category: "vital-signs", text: "Heart rate", loinc: "8867-4", value: 74, unit: "/min", ucum: "/min", date: "2026-01-15" },
      { category: "vital-signs", text: "Body weight", loinc: "29463-7", value: 85, unit: "kg", ucum: "kg", date: "2026-01-15" },
      { category: "vital-signs", text: "Body height", loinc: "8302-2", value: 178, unit: "cm", ucum: "cm", date: "2026-01-15" },
      { category: "laboratory", text: "Total cholesterol", loinc: "2093-3", value: 215, unit: "mg/dL", ucum: "mg/dL", date: "2026-01-20" },
      { category: "laboratory", text: "Serum creatinine", loinc: "2160-0", value: 0.95, unit: "mg/dL", ucum: "mg/dL", date: "2026-01-20" },
      { category: "laboratory", text: "Serum potassium", loinc: "2823-3", value: 4.1, unit: "mEq/L", ucum: "meq/L", date: "2026-01-20" },
    ],
  },
  {
    key: "synthetic-002",
    family: "Smith",
    given: ["Jane", "M"],
    gender: "female",
    birthDate: "1992-11-02",
    email: "jane.smith@example.com",
    address: {
      line: ["456 Example Ave"],
      city: "Springfield",
      state: "IL",
      postalCode: "62704",
    },
    conditions: [
      { text: "Type 2 diabetes mellitus", snomed: "44054006" },
      { text: "Essential hypertension", snomed: "59621000" },
      { text: "Hyperlipidemia", snomed: "55822004" },
    ],
    medications: [
      {
        text: "Metformin 500 mg tablet",
        dosage: "1 tablet twice daily with meals",
      },
      { text: "Amlodipine 5 mg tablet", dosage: "1 tablet once daily" },
      {
        text: "Atorvastatin 20 mg tablet",
        dosage: "1 tablet once daily at bedtime",
      },
    ],
    allergies: [
      { text: "Sulfonamides", reaction: "Rash", criticality: "low" },
    ],
    immunizations: [
      { text: "Influenza, seasonal (quadrivalent)", date: "2025-10-15" },
      { text: "COVID-19 vaccine (mRNA)", date: "2025-09-10" },
      { text: "Tetanus, diphtheria, pertussis (Tdap)", date: "2023-06-20" },
      { text: "Pneumococcal polysaccharide (PPSV23)", date: "2024-04-12" },
    ],
    observations: [
      { category: "laboratory", text: "Hemoglobin A1c", loinc: "4548-4", value: 7.4, unit: "%", ucum: "%", date: "2026-02-03" },
      { category: "laboratory", text: "Fasting glucose", loinc: "1558-6", value: 118, unit: "mg/dL", ucum: "mg/dL", date: "2026-05-28" },
      { category: "laboratory", text: "Total cholesterol", loinc: "2093-3", value: 198, unit: "mg/dL", ucum: "mg/dL", date: "2026-05-28" },
      { category: "laboratory", text: "LDL cholesterol", loinc: "2089-1", value: 88, unit: "mg/dL", ucum: "mg/dL", date: "2026-05-28" },
      { category: "laboratory", text: "Serum creatinine", loinc: "2160-0", value: 0.9, unit: "mg/dL", ucum: "mg/dL", date: "2026-05-28" },
      { category: "laboratory", text: "eGFR", loinc: "33914-3", value: 92, unit: "mL/min/1.73m2", date: "2026-05-28" },
      { category: "vital-signs", text: "Systolic blood pressure", loinc: "8480-6", value: 128, unit: "mmHg", ucum: "mm[Hg]", date: "2026-05-28" },
      { category: "vital-signs", text: "Diastolic blood pressure", loinc: "8462-4", value: 82, unit: "mmHg", ucum: "mm[Hg]", date: "2026-05-28" },
    ],
  },
  {
    key: "synthetic-003",
    family: "Jones",
    given: ["Robert"],
    gender: "male",
    birthDate: "1975-02-20",
    address: {
      line: ["789 Sample Blvd"],
      city: "Riverton",
      state: "WY",
      postalCode: "82501",
    },
    conditions: [
      { text: "Gastroesophageal reflux disease", snomed: "235595009" },
      { text: "Hyperlipidemia", snomed: "55822004" },
    ],
    medications: [
      { text: "Omeprazole 20 mg capsule", dosage: "1 capsule once daily" },
      { text: "Atorvastatin 20 mg tablet", dosage: "1 tablet once daily" },
    ],
    allergies: [],
    immunizations: [
      { text: "Tetanus, diphtheria, pertussis (Tdap)", date: "2023-03-15" },
      { text: "Influenza, seasonal (quadrivalent)", date: "2025-10-20" },
      { text: "COVID-19 vaccine (mRNA)", date: "2024-12-10" },
    ],
    observations: [
      { category: "vital-signs", text: "Systolic blood pressure", loinc: "8480-6", value: 132, unit: "mmHg", ucum: "mm[Hg]", date: "2026-05-15" },
      { category: "vital-signs", text: "Diastolic blood pressure", loinc: "8462-4", value: 86, unit: "mmHg", ucum: "mm[Hg]", date: "2026-05-15" },
      { category: "vital-signs", text: "Body height", loinc: "8302-2", value: 180, unit: "cm", ucum: "cm", date: "2026-05-15" },
      { category: "vital-signs", text: "Body weight", loinc: "29463-7", value: 92, unit: "kg", ucum: "kg", date: "2026-05-15" },
      { category: "vital-signs", text: "Body mass index", loinc: "39156-5", value: 28.4, unit: "kg/m2", ucum: "kg/m2", date: "2026-05-15" },
      { category: "vital-signs", text: "Heart rate", loinc: "8867-4", value: 72, unit: "/min", ucum: "/min", date: "2026-01-28" },
      { category: "laboratory", text: "Total cholesterol", loinc: "2093-3", value: 215, unit: "mg/dL", ucum: "mg/dL", date: "2026-04-10" },
      { category: "laboratory", text: "LDL cholesterol", loinc: "2089-1", value: 145, unit: "mg/dL", ucum: "mg/dL", date: "2026-04-10" },
      { category: "laboratory", text: "HDL cholesterol", loinc: "2085-9", value: 38, unit: "mg/dL", ucum: "mg/dL", date: "2026-04-10" },
      { category: "laboratory", text: "Triglycerides", loinc: "2571-8", value: 180, unit: "mg/dL", ucum: "mg/dL", date: "2026-04-10" },
    ],
  },
  {
    key: "synthetic-004",
    family: "Garcia",
    given: ["Maria"],
    gender: "female",
    birthDate: "2001-07-30",
    address: {
      line: ["321 Placeholder Rd"],
      city: "Austin",
      state: "TX",
      postalCode: "73301",
    },
    conditions: [
      { text: "Mild intermittent asthma", snomed: "195967001" },
      {
        text: "Seasonal allergic rhinitis (cedar and oak pollen)",
        snomed: "61582004",
      },
    ],
    medications: [
      {
        text: "Albuterol HFA inhaler",
        dosage: "1 to 2 puffs as needed for shortness of breath or wheezing",
      },
    ],
    allergies: [
      {
        text: "Environmental allergens (cedar and oak pollen)",
        reaction: "Nasal congestion, sneezing, itchy eyes",
        criticality: "low",
      },
    ],
    immunizations: [
      { text: "HPV vaccine (Gardasil 9)", date: "2024-06-15" },
      { text: "HPV vaccine (Gardasil 9)", date: "2024-09-20" },
      { text: "Influenza, seasonal (quadrivalent)", date: "2025-10-10" },
      { text: "COVID-19 vaccine (mRNA)", date: "2026-04-05" },
    ],
    observations: [
      { category: "vital-signs", text: "Body temperature", loinc: "8310-5", value: 37.0, unit: "Cel", ucum: "Cel", date: "2026-02-10" },
      { category: "vital-signs", text: "Systolic blood pressure", loinc: "8480-6", value: 116, unit: "mmHg", ucum: "mm[Hg]", date: "2026-05-22" },
      { category: "vital-signs", text: "Diastolic blood pressure", loinc: "8462-4", value: 74, unit: "mmHg", ucum: "mm[Hg]", date: "2026-05-22" },
      { category: "vital-signs", text: "Heart rate", loinc: "8867-4", value: 68, unit: "/min", ucum: "/min", date: "2026-05-22" },
      { category: "vital-signs", text: "Body weight", loinc: "29463-7", value: 62, unit: "kg", ucum: "kg", date: "2026-05-22" },
      { category: "vital-signs", text: "Body height", loinc: "8302-2", value: 167, unit: "cm", ucum: "cm", date: "2026-05-22" },
      { category: "laboratory", text: "Total cholesterol", loinc: "2093-3", value: 180, unit: "mg/dL", ucum: "mg/dL", date: "2026-03-05" },
    ],
  },
];
