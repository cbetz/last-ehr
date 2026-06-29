# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories:
the repository's **Security** tab → **Report a vulnerability**. Do not open a
public issue for a vulnerability.

This is a solo-maintained, alpha project — reports are handled on a best-effort
basis with no guaranteed SLA. Thank you for disclosing responsibly.

## Never include real patient data

Last EHR is for use with **synthetic data**. Do not paste real PHI/PII into
issues, pull requests, logs, or reproduction steps. If a report requires data,
use synthetic records (e.g. a [Synthea](https://github.com/synthetichealth/synthea)
bundle).

## Scope & posture

- **Last EHR is not a HIPAA-covered service.** It is a layer you self-host. When
  you point it at a backend and a model provider with your own keys, **you** are
  responsible for the data that flows through them — including any business
  associate agreements (with your FHIR backend and your model provider) required
  for real PHI.
- **Access control lives in your backend.** Tenant isolation and row-level
  access are enforced by your Medplum project (`Project` / `ProjectMembership` /
  `AccessPolicy`). Last EHR runs as the signed-in user and does not widen that
  scope.
- **Session token.** The Medplum access token is held in a server-set,
  HttpOnly + Secure + SameSite cookie (not in JS-readable storage). Run behind
  HTTPS in any non-local deployment.

## Supported versions

Alpha: only the latest `main` is supported. Pin a commit if you need stability.
