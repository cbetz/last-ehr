# Contributing to Last EHR

Thanks for your interest! This is an early, solo-maintained project, so please
keep expectations calibrated: issues and PRs are reviewed on a best-effort
basis, and not every feature request will fit the roadmap.

## Before you open an issue

- **"My Medplum / backend setup doesn't work"** is usually **not** a Last EHR
  bug. Confirm your FHIR backend works independently first (you can hit its API
  directly), then ask in **Discussions** rather than Issues.
- **Never include real PHI/PII** in issues, PRs, or logs — synthetic data only.
- For vulnerabilities, follow [SECURITY.md](./SECURITY.md) (private advisory),
  not a public issue.

## Pull requests

- Keep PRs **small and focused** — one logical change per PR.
- Run the checks locally before pushing:

  ```bash
  npm run lint
  npm run build
  ```

- Match the surrounding code style; no large unrelated reformatting.

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
