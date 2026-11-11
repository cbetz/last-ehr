export const FHIR_MCP_COMPARISON_PATH = "/compare/fhir-mcp-servers";
export const FHIR_MCP_COMPARISON_CHECKED_ON = "2026-11-11";
export const FHIR_MCP_COMPARISON_URL = `https://www.lastehr.com${FHIR_MCP_COMPARISON_PATH}`;

export interface ComparisonLink {
  label: string;
  href: string;
}

export interface FhirMcpServerRow {
  name: string;
  href: string;
  packageLabel?: string;
  packageHref?: string;
  language: string;
  backends: string;
  reads: string;
  writes: string;
  humanApproval: string;
  license: string;
  lastCommit: string;
  lastCommitHref: string;
  sources: ComparisonLink[];
}

/**
 * Open-source FHIR MCP servers whose public docs were fetched on
 * FHIR_MCP_COMPARISON_CHECKED_ON. Alphabetical. Not a ranking.
 */
export const fhirMcpServers: FhirMcpServerRow[] = [
  {
    name: "Azure AHDS FHIR MCP Server",
    href: "https://github.com/erikhoward/azure-fhir-mcp-server",
    packageLabel: "azure-fhir-mcp-server 1.2.0",
    packageHref: "https://pypi.org/project/azure-fhir-mcp-server/",
    language: "Python",
    backends:
      "Azure Health Data Services FHIR. The README sets fhirUrl with Azure AD client credentials, or an OAuth on-behalf-of HTTP mode.",
    reads:
      "search_fhir, MCP resources such as fhir://Patient/{id}, and get_user_info when OAuth is on.",
    writes: "No write tool is listed in the README tools section.",
    humanApproval: "Not applicable. No write tool is listed.",
    license: "MIT",
    lastCommit: "2025-10-10",
    lastCommitHref: "https://github.com/erikhoward/azure-fhir-mcp-server/commit/cab0bb5",
    sources: [
      {
        label: "README",
        href: "https://github.com/erikhoward/azure-fhir-mcp-server/blob/main/README.md",
      },
      { label: "PyPI", href: "https://pypi.org/project/azure-fhir-mcp-server/" },
    ],
  },
  {
    name: "Epic FHIR MCP Server",
    href: "https://github.com/albertorb/mcp-server-fhir",
    language: "Python",
    backends:
      "Epic FHIR R4. The README walks through a non-production Epic sandbox app with backend-services JWT auth.",
    reads:
      "Patient search and read, plus per-patient Condition, MedicationRequest, Observation, AllergyIntolerance, Immunization, and Procedure reads.",
    writes: "No write tool is listed.",
    humanApproval: "Not applicable. No write tool is listed.",
    license: "Apache-2.0. The README badge says MIT; the GitHub license API reports Apache-2.0.",
    lastCommit: "2026-01-16",
    lastCommitHref: "https://github.com/albertorb/mcp-server-fhir/commit/379bbb2",
    sources: [
      {
        label: "README",
        href: "https://github.com/albertorb/mcp-server-fhir/blob/main/README.md",
      },
    ],
  },
  {
    name: "fhir-dsl MCP",
    href: "https://github.com/awbx/fhir-dsl",
    packageLabel: "@fhir-dsl/mcp 1.2.2",
    packageHref: "https://www.npmjs.com/package/@fhir-dsl/mcp",
    language: "TypeScript",
    backends:
      "One configured FHIR base URL. Auth can be a bearer token, SMART backend services, or a patient-launch refresh token. Resource types are a configured list.",
    reads:
      "read, vread, search, history, capabilities, and operation. Read-only until writes are turned on.",
    writes: "Opt-in create, update, patch, and delete.",
    humanApproval:
      "Optional, and it is not a separate approval screen. With confirmWrites, a write is rejected unless the tool call includes confirm: true. dryRun is a separate optional guard.",
    license: "MIT",
    lastCommit: "2026-05-02",
    lastCommitHref: "https://github.com/awbx/fhir-dsl/commit/8ba22e2",
    sources: [
      {
        label: "MCP README",
        href: "https://github.com/awbx/fhir-dsl/blob/main/packages/mcp/README.md",
      },
      {
        label: "confirmWrites test",
        href: "https://github.com/awbx/fhir-dsl/blob/main/packages/mcp/test/write-safety.test.ts",
      },
      { label: "npm", href: "https://www.npmjs.com/package/@fhir-dsl/mcp" },
    ],
  },
  {
    name: "fhir-mcp",
    href: "https://github.com/DhairyaShah981/fhir-mcp",
    packageLabel: "fhir-mcp 0.2.2",
    packageHref: "https://pypi.org/project/fhir-mcp/",
    language: "Python",
    backends:
      "In-memory synthetic patients by default. The README also describes FHIR_MCP_BACKEND=hapi and other FHIR R4 servers.",
    reads:
      "search_patients, get_patient_summary, search_observations, search_conditions, get_medications, validate_code, and run_cds_hook. These are focused tools, not a generic resource browser.",
    writes: "create_clinical_note creates a DocumentReference.",
    humanApproval: "Not described in the README.",
    license: "Apache-2.0",
    lastCommit: "2026-06-24",
    lastCommitHref: "https://github.com/DhairyaShah981/fhir-mcp/commit/da96f20",
    sources: [
      {
        label: "README",
        href: "https://github.com/DhairyaShah981/fhir-mcp/blob/main/README.md",
      },
      { label: "PyPI", href: "https://pypi.org/project/fhir-mcp/" },
    ],
  },
  {
    name: "FHIR-MCP",
    href: "https://github.com/xSoVx/fhir-mcp",
    language: "TypeScript",
    backends:
      "A FHIR base URL. The README example is the public HAPI R4 endpoint, plus a terminology base URL.",
    reads:
      "fhir.read, fhir.search, and fhir.capabilities, plus terminology lookup, expand, and translate.",
    writes: "fhir.create and fhir.update.",
    humanApproval: "Not described in the README.",
    license: "MIT",
    lastCommit: "2026-09-13",
    lastCommitHref: "https://github.com/xSoVx/fhir-mcp/commit/33b90a1",
    sources: [
      { label: "README", href: "https://github.com/xSoVx/fhir-mcp/blob/master/README.md" },
    ],
  },
  {
    name: "fhirHydrant",
    href: "https://github.com/faulkj/fhirHydrant",
    packageLabel: "fhirhydrant 0.17.3",
    packageHref: "https://www.npmjs.com/package/fhirhydrant",
    language: "TypeScript",
    backends:
      "FHIR R4+ using SMART Backend Services (signed JWT). Resources and operations come from config and the server CapabilityStatement.",
    reads:
      "Search, read, vread, and history. Terminology lookup and named operations are optional.",
    writes:
      "Create, update, patch, and delete only when FHIR_WRITE_CAPABILITIES lists them. FHIR_WRITE_DRY_RUN can validate a write without sending it.",
    humanApproval: "Not described as required.",
    license: "Kopimi",
    lastCommit: "2026-09-15",
    lastCommitHref: "https://github.com/faulkj/fhirHydrant/commit/1a24376",
    sources: [
      {
        label: "README",
        href: "https://github.com/faulkj/fhirHydrant/blob/master/README.md",
      },
      {
        label: "LICENSE.md",
        href: "https://github.com/faulkj/fhirHydrant/blob/master/LICENSE.md",
      },
      { label: "npm", href: "https://www.npmjs.com/package/fhirhydrant" },
    ],
  },
  {
    name: "healsens-fhirmcp",
    href: "https://github.com/healsens/healsens-fhirmcp",
    language: "Go",
    backends:
      "One configured FHIR R4 or R5 base URL, with a bearer token when the server requires one.",
    reads:
      "fhir_read, fhir_search, capability and structure lookups, and operations the README limits to read-only.",
    writes: "None. The README says the tool surface is read-only by design.",
    humanApproval: "Not applicable. There are no write tools.",
    license: "AGPL-3.0",
    lastCommit: "2026-04-17",
    lastCommitHref: "https://github.com/healsens/healsens-fhirmcp/commit/f97da08",
    sources: [
      {
        label: "README",
        href: "https://github.com/healsens/healsens-fhirmcp/blob/main/README.md",
      },
    ],
  },
  {
    name: "health-record-mcp (archived)",
    href: "https://github.com/jmandel/health-record-mcp",
    language: "TypeScript",
    backends:
      "SMART on FHIR. Tool calls query a record already saved in a local SQLite file. The README includes Epic sandbox brand configuration. GitHub marks the repository archived.",
    reads:
      "grep_record, query_record (SQL SELECT), and eval_record (JavaScript over the fetched record).",
    writes: "No write tool is listed.",
    humanApproval: "Not applicable. No write tool is listed.",
    license: "MIT",
    lastCommit: "2025-08-15",
    lastCommitHref: "https://github.com/jmandel/health-record-mcp/commit/e4b03bd",
    sources: [
      {
        label: "README",
        href: "https://github.com/jmandel/health-record-mcp/blob/main/README.md",
      },
    ],
  },
  {
    name: "LangCare MCP FHIR",
    href: "https://github.com/langcare/langcare-mcp-fhir",
    packageLabel: "@langcare/langcare-mcp-fhir 2.5.0",
    packageHref: "https://www.npmjs.com/package/@langcare/langcare-mcp-fhir",
    language: "Go",
    backends:
      "Any FHIR R4 server. The README names Epic, Cerner, OpenEMR, and Google Cloud Healthcare API.",
    reads: "fhir_read and fhir_search for any R4 resource type.",
    writes: "fhir_create and fhir_update.",
    humanApproval: "Not described as a server requirement.",
    license: "MIT",
    lastCommit: "2026-04-14",
    lastCommitHref: "https://github.com/langcare/langcare-mcp-fhir/commit/430598b",
    sources: [
      {
        label: "README",
        href: "https://github.com/langcare/langcare-mcp-fhir/blob/main/README.md",
      },
      {
        label: "npm",
        href: "https://www.npmjs.com/package/@langcare/langcare-mcp-fhir",
      },
    ],
  },
  {
    name: "Last EHR",
    href: "https://github.com/cbetz/last-ehr",
    packageLabel: "@lastehr/mcp 0.5.1",
    packageHref: "https://www.npmjs.com/package/@lastehr/mcp",
    language: "TypeScript",
    backends:
      "Medplum. This repository's local HAPI stack when FHIR_BACKEND=hapi. The public Epic sandbox, the public Oracle Health sandbox, and a generic SMART Backend Services server when LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1 and LASTEHR_BACKEND is epic, oracle, or smart.",
    reads:
      "Four read tools. The section reader covers 23 patient-scoped sections: 25 of 27 US Core 9.0.0 resource types, plus Communication, Task, and AuditEvent. Medication and PractitionerRole are not sections.",
    writes:
      "Off by default. LASTEHR_MCP_WRITES=proposal adds creates for a note (Communication), a measurement or linked correction (Observation), and a follow-up task (Task). No update or delete tools.",
    humanApproval:
      "Yes. Each write waits for an explicit human decision in a client that supports MCP elicitation. Clients that cannot show that prompt are not offered the write tools.",
    license: "Apache-2.0",
    lastCommit: "2026-11-10",
    lastCommitHref: "https://github.com/cbetz/last-ehr/commit/13ff43f",
    sources: [
      { label: "Repository", href: "https://github.com/cbetz/last-ehr" },
      { label: "MCP guide", href: "https://www.lastehr.com/docs/mcp" },
      { label: "FHIR coverage", href: "https://www.lastehr.com/docs/fhir-coverage" },
      {
        label: "Sandbox adapters",
        href: "https://github.com/cbetz/last-ehr/blob/main/docs/adapters/epic-cerner.md",
      },
      { label: "npm", href: "https://www.npmjs.com/package/@lastehr/mcp" },
    ],
  },
  {
    name: "Medplum MCP",
    href: "https://github.com/rkirkendall/medplum-mcp",
    language: "TypeScript",
    backends:
      "Medplum, using MEDPLUM_BASE_URL and a client id and secret. The README example is a local Medplum server.",
    reads:
      "Get and search tools for Patient, Practitioner, Organization, Encounter, Observation, MedicationRequest, Medication, and EpisodeOfCare, plus generalFhirSearch.",
    writes:
      "Create and update tools for those types. The README lists create and search for Medication, and does not list an update tool for Medication.",
    humanApproval: "Not described in the README.",
    license: "MIT",
    lastCommit: "2025-06-10",
    lastCommitHref: "https://github.com/rkirkendall/medplum-mcp/commit/182a8bb",
    sources: [
      {
        label: "README",
        href: "https://github.com/rkirkendall/medplum-mcp/blob/main/README.md",
      },
    ],
  },
  {
    name: "Momentum FHIR MCP Server",
    href: "https://github.com/the-momentum/fhir-mcp-server",
    language: "Python",
    backends:
      "A FHIR server with OAuth2 client credentials. The README demo uses Medplum. LOINC and Pinecone are separate optional services.",
    reads:
      "Named tools for Patient, Observation, Condition, Medication, Immunization, Encounter, AllergyIntolerance, FamilyMemberHistory, and DocumentReference, plus request_generic_resource for other types.",
    writes:
      "The README says each FHIR resource tool supports create, read, update, and delete.",
    humanApproval: "Not described in the README.",
    license: "MIT",
    lastCommit: "2025-10-13",
    lastCommitHref: "https://github.com/the-momentum/fhir-mcp-server/commit/df048bc",
    sources: [
      {
        label: "README",
        href: "https://github.com/the-momentum/fhir-mcp-server/blob/main/README.md",
      },
    ],
  },
  {
    name: "PyMedplum",
    href: "https://github.com/kinsteadhealth/pymedplum",
    packageLabel: "pymedplum 0.6.0",
    packageHref: "https://pypi.org/project/pymedplum/",
    language: "Python",
    backends:
      "Medplum, hosted or self-hosted, via MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET. The MCP entry point is pymedplum-mcp.",
    reads:
      "read, search, patient $everything, schema lookup, and terminology helpers. Write tools exist and stay blocked until writes are enabled.",
    writes:
      "create, update, patch, delete, conditional create, and other mutation tools when MEDPLUM_ENABLE_WRITES=true.",
    humanApproval:
      "Not described as a required prompt. The MCP guide says review of tool calls belongs to the calling agent.",
    license: "Apache-2.0",
    lastCommit: "2026-08-03",
    lastCommitHref: "https://github.com/kinsteadhealth/pymedplum/commit/2898a57",
    sources: [
      {
        label: "MCP guide",
        href: "https://github.com/kinsteadhealth/pymedplum/blob/main/docs/mcp.md",
      },
      { label: "PyPI", href: "https://pypi.org/project/pymedplum/" },
    ],
  },
  {
    name: "WSO2 FHIR MCP Server",
    href: "https://github.com/wso2/fhir-mcp-server",
    packageLabel: "fhir-mcp-server 0.11.0",
    packageHref: "https://pypi.org/project/fhir-mcp-server/",
    language: "Python",
    backends:
      "Any FHIR base URL set as FHIR_SERVER_BASE_URL. The README demos use HAPI and the Epic sandbox. Auth is SMART-on-FHIR client credentials, a static access token for local stdio, or authorization disabled.",
    reads: "get_capabilities, search, and read, for a resource type the caller names.",
    writes: "create, update, and delete tools.",
    humanApproval: "Not described in the README.",
    license: "Apache-2.0",
    lastCommit: "2026-11-06",
    lastCommitHref: "https://github.com/wso2/fhir-mcp-server/commit/25a1e0b",
    sources: [
      {
        label: "README",
        href: "https://github.com/wso2/fhir-mcp-server/blob/main/README.md",
      },
      { label: "PyPI", href: "https://pypi.org/project/fhir-mcp-server/" },
    ],
  },
];

const COLUMNS = [
  "Name",
  "Language",
  "FHIR backends",
  "Read coverage",
  "Write support",
  "Writes require human approval",
  "License",
  "Last commit",
] as const;

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function fhirMcpComparisonMarkdown(): string {
  const header = COLUMNS.join(" | ");
  const rule = COLUMNS.map(() => "---").join(" | ");
  const rows = fhirMcpServers.map((server) =>
    [
      `[${server.name}](${server.href})`,
      server.language,
      server.backends,
      server.reads,
      server.writes,
      server.humanApproval,
      server.license,
      `[${server.lastCommit}](${server.lastCommitHref})`,
    ]
      .map(escapeCell)
      .join(" | "),
  );

  const sources = fhirMcpServers.flatMap((server) => [
    `### ${server.name}`,
    "",
    ...server.sources.map((source) => `- [${source.label}](${source.href})`),
    "",
  ]);

  return [
    "# FHIR MCP servers compared",
    "",
    `Checked on ${FHIR_MCP_COMPARISON_CHECKED_ON}.`,
    "",
    "Alphabetical list of open-source MCP servers whose public docs describe FHIR resource access. Last EHR is one row. This is not a ranking and it is not a clinical, safety, or compliance claim.",
    "",
    "Last commit is the committer date of the default-branch HEAD returned by the GitHub API. A package version is the npm or PyPI latest version returned the same day, when a package exists. Those two facts are not the same release. \"Not described\" means the linked README does not describe that behavior.",
    "",
    `| ${header} |`,
    `| ${rule} |`,
    ...rows.map((row) => `| ${row} |`),
    "",
    "## Sources",
    "",
    ...sources,
  ].join("\n");
}

export function fhirMcpComparisonJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${FHIR_MCP_COMPARISON_URL}#webpage`,
    name: "FHIR MCP servers compared",
    url: FHIR_MCP_COMPARISON_URL,
    dateModified: FHIR_MCP_COMPARISON_CHECKED_ON,
    description:
      "Alphabetical comparison of open-source FHIR MCP servers, checked on 2026-11-11. Not a ranking and not a clinical, safety, or compliance claim.",
    mainEntity: {
      "@type": "ItemList",
      name: "FHIR MCP servers compared",
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: fhirMcpServers.length,
      itemListElement: fhirMcpServers.map((server, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "SoftwareApplication",
          name: server.name,
          url: server.href,
          operatingSystem: server.language,
          applicationCategory: "HealthApplication",
          license: server.license,
          description: [
            server.backends,
            server.reads,
            server.writes,
            server.humanApproval,
          ].join(" "),
        },
      })),
    },
  };
}
