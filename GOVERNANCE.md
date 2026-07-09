# Governance

Last EHR is currently a solo-maintained open-source project. Governance is
simple on purpose, but the rules should be explicit before outside contributors
invest time.

## Maintainer role

The maintainer is responsible for:

- Setting project direction and scope.
- Reviewing and merging pull requests.
- Cutting releases and updating the roadmap.
- Keeping safety, privacy, and PHI warnings accurate.
- Declining changes that expand clinical risk faster than the project can
  review it.

## Contribution principles

- Synthetic data only in issues, PRs, screenshots, logs, and tests.
- Small, focused PRs beat broad rewrites.
- Adapter contributions need setup notes and end-to-end verification.
- Safety-sensitive behavior needs tests and documentation.
- Marketing copy should stay precise: Last EHR is a layer, not an EHR.

## Decision rules

Changes are evaluated against four questions:

1. Does this improve the reference implementation for approval-gated FHIR
   agents?
2. Can users understand the safety and privacy boundary after the change?
3. Can a self-hoster run and verify it with synthetic data?
4. Does it keep access control in the backend instead of reimplementing it in
   the app?

If the answer is unclear, the change should start as a discussion or draft PR.

## Releases

Until 1.0, releases are compatibility signals rather than stability promises.
Breaking changes are allowed, but they should be called out in `CHANGELOG.md`
and the roadmap when they affect self-hosters.

## Security

Use GitHub Security Advisories for vulnerabilities. Do not open public issues
with exploit details or real patient data. See `SECURITY.md`.
