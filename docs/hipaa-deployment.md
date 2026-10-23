# HIPAA Deployment Groundwork

Last reviewed: **October 23, 2026**. Status: **synthetic-only alpha**.

This guide prepares an exact deployment for review. It is not a compliance
certification, a signed agreement, or permission to use patient data. No
customer-specific contracts, accounts, or service configurations have been
qualified by this repository. The public demo, MCP Local Lab, Assistant Work
Lab, recordings, and evaluator exercises use invented patients.

## What the approval gate covers

Last asks for a decision before a proposed chart write. It does not gate chart
reads. In a model-backed workflow, chart context can leave the FHIR backend for
the model or assistant before any write proposal appears. Approving a write
does not authorize an otherwise inappropriate disclosure to that service.

The web agent has no separate chart database. That does not mean it avoids
patient-data processing. Durable proposals add storage: the opt-in
[Assistant Work Lab](./assistant-work.md) keeps synthetic work and review
records in local SQLite. Any future clinical work service must qualify that
store, its access controls, retention, and backups explicitly.

## Determine the operator's role

Publishing software without access to a customer's PHI does not automatically
make its publisher a business associate. Operating a hosted service or
accessing PHI for troubleshooting can create that relationship. Confirm who
operates Last, who can access data, and on whose behalf each service works.
[HHS software-vendor guidance](https://www.hhs.gov/hipaa/for-professionals/faq/is-software-vendor-business-associate/index.html)

A cloud provider processing or maintaining ePHI on behalf of a covered entity
or business associate generally needs the applicable BAA, including a provider
holding encrypted ePHI without the key. Determine each relationship rather
than treating every recipient of PHI as a business associate. Agreements do
not replace the deployment's risk analysis and safeguards.
[HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html)

## Data map for review

The table distinguishes implemented paths from proposed integrations. Treat
all identifying clinical content as sensitive during deployment review,
including free text, resource references, derived summaries, and recordings.

| Surface | Current implementation or proposed use | Data and boundary to qualify |
| --- | --- | --- |
| Browser and review UI | Current web chat; separate local Work Lab UI | Chat, chart results, and proposals appear in browser memory. Review browser extensions, shared workstations, screenshots, caches, session expiry, and identity. |
| FHIR backend | Medplum authenticated path; local HAPI and other evaluation adapters | Source chart and committed resources remain here. Backend access policies govern authenticated FHIR calls. Local HAPI has no clinical authentication. |
| Last web process | Next.js chat and FHIR tools | Handles prompts, tokens, chart context, draft payloads, and results. Qualify runtime administrators, network paths, secrets, and request logging. |
| Model API | Configured provider in the model-backed web agent | Receives prompt and tool results. Qualify exact model, endpoint, account, retention, abuse monitoring, region, and contractual coverage. Scripted walkthroughs do not call a model. |
| Remote MCP server | Optional OAuth transport | Exchanges the caller's token and handles chart results. Host support for elicitation does not authenticate the human reviewer. Review the separate [remote MCP evidence and limits](./remote-mcp.md). |
| Assistant host | Muse/Grok Bot integrations proposed, not proven here | Could retain chat, tool results, memories, files, computer state, and logs. A connector transfers data to that host even if Last stores no transcript. |
| Durable work store | Implemented only in the opt-in synthetic Work Lab | Local SQLite holds proposals, proposal hashes, role identifiers, decisions, states, and commit receipts. The default location is `.lastehr/work-lab/work.sqlite`; include SQLite sidecar files and disk backups in cleanup. Owner-only file permissions are not encryption or clinical identity. |
| Agent execution | eve reference worker proposed; not installed for this lab | A future executor can retain checkpoints, tool results, traces, sandbox files, and subagent context. Inventory each store and every provider it calls before enabling it. |
| Audit and provenance | Existing optional FHIR audit/provenance; local lab state/receipts | Current audit features are not a complete authenticated clinical audit trail. Determine record contents, access, integrity, retention, and failure behavior. A receipt proves a bounded outcome, not clinical correctness. |
| Logs, analytics, and monitoring | Server errors; optional demo analytics | Error summaries can retain error-message content. Bounded analytics events are not evidence that all platform logging is PHI-free. Inspect actual log samples and disable unqualified tracking on clinical surfaces. See [metrics](./metrics.md). |
| Infrastructure and support | Operator-selected hosting, proxy, database, backups, and support access | Review TLS termination, request inspection, storage snapshots, disaster recovery, support tickets, incident tools, CI artifacts, and deletion. Do not put PHI in builds, demos, issues, or public repositories. |

For a proposed clinical deployment, replace this map with the actual endpoints,
accounts, regions, administrators, retention periods, and contractual owners.
Record outbound calls from the exact configuration; do not infer the data path
from the framework name.

## Service qualification findings

These are public-document findings, not verified customer agreements. Recheck
them when selecting a deployment because eligible products and terms change.

| Service | Finding as of October 23, 2026 | Decision for this project |
| --- | --- | --- |
| Meta Muse | Custom connectors exchange task-related data. We have not verified a Muse-specific BAA or PHI-eligible configuration. [Meta connector documentation](https://www.meta.com/help/superintelligence/1687253048996149/) | Synthetic integration only until exact coverage is established. |
| Grok Bot | Cursor offers Enterprise BAAs, but the public eligible-services list does not name Grok Bot. Signed scope and the HIPAA configuration guide control. [Cursor BAA documentation](https://cursor.com/docs/enterprise/baa) | Do not infer Bot coverage from a Cursor or xAI API agreement. Synthetic only here. |
| xAI API | Enterprise Terms §11.1 require a prior BAA and use of the ZDR-enabled API for PHI. [Enterprise Terms](https://x.ai/legal/terms-of-service-enterprise) | A possible separately contracted model path, not an approved configuration or evidence about Grok Bot. |
| Vercel hosting and AI Services | Hosting BAAs are offered. The current AI Services AUP prohibits processing PHI; general hosting coverage must not be assumed to cover an AI service. [Hosting guide](https://vercel.com/kb/guide/hipaa-compliance-guide-vercel), [AUP §3](https://vercel.com/legal/acceptable-use-policy) | Obtain explicit service/configuration coverage and resolve restrictions before any clinical deployment. |
| Medplum | Public BAA and compliance materials apply to the hosted environment; self-hosting is separate. [Medplum HIPAA documentation](https://www.medplum.com/docs/compliance/hipaa) | Confirm exact hosted agreement or qualify the self-hosted infrastructure. This does not cover Last's other services. |
| eve | Self-hosted deployment and configurable providers are documented. Its runtime choice provides no automatic HIPAA qualification. [Self-hosting guide](https://eve.dev/docs/guides/deployment/self-hosting) | Inventory model, workflow persistence, sandbox, traces, and hosted dependencies if we add it. |
| Cloudflare or another network intermediary | No exact account, service scope, configuration, or executed agreement has been reviewed for a clinical Last deployment. | Qualify actual proxy/tunnel/CDN/logging services rather than assuming brand-level coverage. The Work Lab uses loopback and needs no tunnel. |

## Technical evidence needed before a clinical pilot

The Work Lab demonstrates selected mechanics using synthetic data. A clinical
deployment requires additional evidence for its own configuration:

- A documented data and egress inventory matching a pinned release and actual
  services; tests for unexpected model, tracing, analytics, and network calls.
- Organization-managed identities, appropriate MFA, tenant and patient access
  checks, reviewer authorization, session expiry, revocation, and independent
  separation between assistant submission and human decisions.
- Review of the exact immutable proposal revision; policy and authorization
  checks at commit; no assistant tool that can manufacture human approval.
- Commit reconciliation after lost responses, duplicate prevention, and tested
  cancellation, expiry, failure, and restart behavior. Concurrent or uncertain
  outcomes must not be reported as a confirmed save.
- Protected transport and storage, managed keys and secrets, bounded logging,
  tested audit integrity, least-privilege administrative access, and a defined
  retention/deletion policy including replicas, traces, and backups.
- Tested restoration, incident detection, access review, patching, and safe
  deployment/rollback procedures with assigned owners.

These are engineering review items, not a complete legal checklist. Document
the design and test evidence rather than checking a feature-name box.

## Organizational and contractual evidence

Assign privacy and security responsibility. Complete and maintain a risk
analysis and risk-management plan, workforce access/training procedures,
incident and breach response, contingency planning, and applicable policies.
Record which responsibilities belong to the customer and each service
operator. [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)

Have the deployment owner and qualified healthcare privacy counsel confirm
the parties' roles, permitted use, required agreements, and configuration
restrictions. Other applicable health/privacy rules and clinical obligations
also need review for the intended workflow. Do not treat this repository or a
vendor's marketing badge as that determination.

## Deployment review record

Create one private record per proposed clinical configuration. Do not place
patient information, secrets, or executed agreements in this public repository.

| Field | Evidence to attach privately |
| --- | --- |
| Release and purpose | Commit/version, operator, customer, workflow, intended users, and permitted data |
| Roles and service inventory | Covered-entity/business-associate analysis; exact products, accounts, endpoints, regions, subprocessors, and support access |
| Agreements | Executed applicable agreements, eligible-service restrictions, retention settings, and responsibility allocation |
| Data map and controls | Actual egress, storage/backup inventory, access model, encryption, audit, deletion, and incident procedures |
| Verification | Synthetic end-to-end, authorization, restart/reconciliation, log inspection, restoration, and revocation results |
| Open findings and decision | Named risk owners, unresolved items, review date, and explicit pilot decision for this configuration |

The current decision is **synthetic evaluation only**. A real-patient pilot
remains pending this exact-configuration review; there is no automatic switch
from a passing lab or a signed BAA to clinical readiness.

## Public demonstrations and contributor materials

Use wholly invented patients for videos, templates, screenshots, fixtures,
support requests, and integration exercises. Removing a name from a real
chart does not by itself establish de-identification. Describe demonstrated
controls precisely: separate lab roles, a reviewed payload, and a verified
FHIR result. Do not advertise HIPAA certification or production Muse/Grok
compatibility based on this lab.

See [SECURITY.md](../SECURITY.md) for private vulnerability reporting and
[Assistant Work Lab](./assistant-work.md) for the runnable synthetic boundary.
