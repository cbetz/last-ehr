# Contributing to Last EHR

Thanks for your interest! This is an early, solo-maintained project, so please
keep expectations calibrated: issues and PRs are reviewed on a best-effort
basis, and not every feature request will fit the roadmap.

## Before you open an issue

- **"My Medplum / backend setup doesn't work"** is usually **not** a Last EHR
  bug. Confirm your FHIR backend works independently first (you can hit its API
  directly), then ask in **Discussions** rather than Issues.
- **Never include real PHI/PII** in issues, PRs, or logs; synthetic data only.
- For vulnerabilities, follow [SECURITY.md](./SECURITY.md) (private advisory),
  not a public issue.

## Pull requests

- Keep PRs **small and focused**: one logical change per PR.
- Run the checks locally before pushing:

  ```bash
  npm run lint
  npm run build
  ```

- Match the surrounding code style; no large unrelated reformatting.

Good first PRs are usually one of:

- Docs that make setup or safety boundaries clearer.
- Small demo UX improvements that do not change clinical behavior.
- Tests around existing tool behavior.
- A backend adapter spike opened as a draft PR with synthetic data only.

For larger changes, open an issue or draft PR early so scope and safety
expectations are clear before you invest heavily.

## Writing a backend adapter

The most wanted contribution: adapters for FHIR backends beyond Medplum and
local HAPI FHIR. Aidbox, Oystehr, Firely, and OpenEMR's FHIR API are good
targets if their auth/search behavior can satisfy the adapter contract. The
seam is the `FhirBackend` interface in
[`lib/fhir/backend.ts`](./lib/fhir/backend.ts): four methods (`search`,
`searchResources`, `createResource`, `deleteResource`) over plain FHIR R4 REST.
[`lib/fhir/medplum.ts`](./lib/fhir/medplum.ts) is the reference implementation.
See [docs/adapters.md](./docs/adapters.md) for the full checklist.

An adapter PR needs:

1. **The adapter**: `lib/fhir/<backend>.ts` implementing `FhirBackend`,
   including whatever auth story that backend needs (client credentials,
   static token). Honor the two contract notes documented on the interface:
   fetch single resources via search (`_id=`), never a direct read, because
   compartment-scoped policies may only be enforced on the search path; and
   persist `meta.tag` exactly as given, because the public demo relies on it
   for per-session write isolation.
2. **Tests**: mirror `lib/fhir/medplum.test.ts` (construction and
   delegation), plus anything specific to that backend's auth.
3. **How you verified it**: the backend you ran (Docker image, cloud
   sandbox), and confirmation that the four tools work against it end to
   end. Synthetic data only.
4. **Docs**: a short setup note in the README or the adapter file header,
   including honest caveats (for example, HAPI ships with no auth or access
   policy by default).

Use the backend adapter issue template when proposing a new target.

## Safety-sensitive changes

Anything that changes reads, writes, approval behavior, auth, session handling,
or PHI/privacy copy needs tests or a clear verification note. For approval-gate
work, read [docs/approval-gates.md](./docs/approval-gates.md) and
[docs/threat-model.md](./docs/threat-model.md) first.

Open a draft PR early if you want direction before finishing.

## Developer Certificate of Origin (DCO)

This project uses the [DCO](https://developercertificate.org/) instead of a CLA.
Sign off every commit to certify you wrote the change (or have the right to
submit it) under the project's Apache-2.0 license:

```bash
git commit -s -m "your message"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line. PRs whose commits
aren't signed off will be asked to amend.

## License

By contributing, you agree your contributions are licensed under the project's
[Apache-2.0](./LICENSE) license.
