import { defineFhirBackendContract } from "../../../test/fhir-backend-contract";
import { MemoryFhirClient } from "./memory.js";

// The behavioral contract every Medplum and HAPI adapter runs. This store
// meets it in-process. The REST wire contract does not apply; see memory.ts.
defineFhirBackendContract({
  name: "in-memory FHIR",
  createBackend: () => new MemoryFhirClient(),
});
