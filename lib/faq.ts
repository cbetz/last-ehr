export interface ProductFaqItem {
  q: string;
  a: string;
}

/**
 * Plain-text answers shared by the homepage FAQ, FAQPage JSON-LD, llms.txt,
 * and the README. Keep the wording free of clinical, safety, and compliance
 * claims.
 */
export const productFaq: ProductFaqItem[] = [
  {
    q: "How do I connect Claude/Cursor to a FHIR server?",
    a: "Run npx -y @lastehr/mcp@0.5.1 init --client claude-code, or npx -y @lastehr/mcp@0.5.1 init --client cursor. The Claude Code command prints a claude mcp add line. The Cursor command prints JSON for ~/.cursor/mcp.json or .cursor/mcp.json, including type stdio. Point that server at a FHIR backend you operate: a Medplum access token (MEDPLUM_ACCESS_TOKEN), or MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET, or this repository's local HAPI stack with FHIR_BACKEND=hapi and FHIR_BASE_URL such as http://localhost:8080/fhir. Claude or Cursor supplies the model. The MCP server talks to the FHIR server. Start with synthetic records. Setup: https://www.lastehr.com/docs/mcp",
  },
  {
    q: "Can an AI agent write to Epic?",
    a: "Only the public Epic FHIR sandbox, and only with the experimental adapter flag LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1. The MCP package selects that sandbox with LASTEHR_BACKEND=epic. The web app selects it with FHIR_BACKEND=epic and the same flag. A write still waits for a person to approve it. The sandbox does not support delete, so an approved Observation stays on that shared sandbox. This is not a connection to a production Epic system. Setup: https://github.com/cbetz/last-ehr/blob/main/docs/adapters/epic-cerner.md",
  },
  {
    q: "How does human approval of agent writes work?",
    a: "Writes are off until LASTEHR_MCP_WRITES=proposal. That profile can create a note (Communication), a measurement or a linked correction (Observation), or a follow-up task (Task). Each write pauses until a person approves it in a client that supports MCP elicitation. Approve sends that proposal to the FHIR server. Cancel, or no answer, saves nothing. A client that cannot show the prompt is not offered the write tools. The web app shows the same decision on an approval card. The FHIR server can still reject the write. Approving saves the proposal. It does not review the proposal for clinical correctness.",
  },
  {
    q: "Does it use real patient data?",
    a: "No. The public demo and the local HAPI walkthrough use synthetic patients. The Epic and Oracle Health paths use those vendors' public sandboxes and their synthetic sandbox patients. Do not point this alpha software at real patient records while you are evaluating it.",
  },
];
