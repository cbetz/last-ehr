# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories:
the repository's **Security** tab → **Report a vulnerability**. Do not open a
public issue for a vulnerability.

This is a solo-maintained, alpha project; reports are handled on a best-effort
basis with no guaranteed SLA. Thank you for disclosing responsibly.

## Never include real patient data

Last EHR is for use with **synthetic data**. Do not paste real PHI/PII into
issues, pull requests, logs, or reproduction steps. If a report requires data,
use synthetic records (e.g. a [Synthea](https://github.com/synthetichealth/synthea)
bundle).

## Scope & posture

- **This alpha is synthetic-only.** The repository does not establish a
  HIPAA-qualified deployment or verify any operator's agreements. Publishing
  software without access to a customer's PHI does not by itself create a
  business-associate relationship; hosting it or accessing PHI to provide a
  service can. Determine the actual roles and applicable agreements for the
  deployment, including infrastructure, model processing, support, and
  subcontractors. A provider's BAA offering does not cover every product,
  account, model, or configuration. Zero-data-retention settings and an API key
  do not substitute for the applicable agreements and safeguards. See the
  [HIPAA deployment groundwork](./docs/hipaa-deployment.md) for the data map,
  sources, and unresolved clinical-pilot requirements.
- **Reads are not gated.** The approval gate applies to writes. Anything the
  agent reads from the chart is sent to your configured model provider as
  context, with no approval step. Choose a provider and agreement appropriate
  for your data.
- **Access control lives in your backend.** Tenant isolation and row-level
  access are enforced by your Medplum project (`Project` / `ProjectMembership` /
  `AccessPolicy`). Last EHR runs as the signed-in user and does not widen that
  scope.
- **Session token.** The Medplum access token is held in a server-set,
  HttpOnly + Secure + SameSite cookie (not in JS-readable storage). Run behind
  HTTPS in any non-local deployment.
- **Processing and storage both matter.** Last processes chart data and
  proposals even though the web agent has no separate chart database. Model
  context, assistant memory, error messages, infrastructure logs, and backups
  need their own review. The opt-in [Assistant Work Lab](./docs/assistant-work.md)
  deliberately persists synthetic proposals and decisions in local SQLite.
  Its separate lab keys distinguish roles; they do not authenticate a clinical
  workforce member or provide production tenant isolation.
- **MCP approval depends on the host.** A client returning an elicitation
  approval is not independent evidence that a human reviewed it. The Work Lab
  exercises separate reviewer credentials and exact-proposal binding using
  synthetic records; production reviewer identity remains unqualified.

## Liability

Last EHR is provided as-is under Apache-2.0. When you approve a write, you are
responsible for its accuracy and clinical appropriateness, the same as if you
had entered it yourself. Approval gating reduces unilateral AI writes; it does
not eliminate hallucination risk or shift responsibility for what you approve.
Your model provider and FHIR backend have their own terms; review those
agreements before using anything beyond synthetic data.

## Supported versions

Alpha: only the latest `main` is supported. Pin a commit if you need stability.
