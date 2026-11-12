import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { patients } from "./fixtures/patients";

// The published package cannot import scripts/fixtures. This writes the
// fixture array into the package so `tsc` emits it inside dist/.
const target = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/mcp/src/synthetic-patients.ts",
);

const source = `// Generated from scripts/fixtures/patients.ts by scripts/sync-mcp-synthetic-patients.ts.
// Synthetic fixture records only. Do not edit by hand.
import type { SyntheticChartInput } from "./synthetic-chart.js";

export const syntheticPatients = ${JSON.stringify(patients, null, 2)} as SyntheticChartInput[];
`;

writeFileSync(target, source);
console.log(`Wrote ${target}`);
