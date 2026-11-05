# Last EHR MCP 0.5.0: approval-gated writes on the Epic and Oracle Health sandboxes

This is a draft. Merging the version bump does not publish the package,
cut a tag, or open a GitHub release. npm `latest` stays on the last
published version until the [release process](../releasing-mcp.md) runs
on purpose.

Headline: an MCP client can propose an Observation, a person approves the
exact body the sandbox will accept, and the agent gets a read-back diff of
what was stored. Synthetic sandbox patients only. This is not a clinical,
regulatory, or compliance claim.

## What a client runs

```bash
npx @lastehr/mcp init --backend epic
npx @lastehr/mcp doctor
```

`init` prints a client config of placeholders and the setup steps on
stderr. `doctor` checks the private key, the JWKS `kid` when
`LASTEHR_JWKS_URL` is set, the token exchange, the granted scopes, and
whether Patient search is allowed. It does not print a key, an assertion,
or an access token.

`LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1` is required. The Epic and Oracle
Health sandboxes do not support delete, so an approved Observation
persists and the safety eval cannot clean up after itself.

## Env

Epic:

```bash
export LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1
export LASTEHR_BACKEND=epic
export LASTEHR_MCP_WRITES=proposal
export LASTEHR_FHIR_BASE_URL='https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4'
export LASTEHR_TOKEN_URL='https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token'
export LASTEHR_CLIENT_ID='<non-production-client-id>'
export LASTEHR_PRIVATE_KEY_PATH='<path-to-pkcs8-pem>'
export LASTEHR_KEY_ID='<jwks-kid>'
export LASTEHR_JWKS_URL='<https-url-of-your-public-jwks>'
export LASTEHR_ENCOUNTER='<Encounter/id>'
export LASTEHR_PATIENT_ID='<sandbox-patient-id>'
```

`LASTEHR_SCOPES` is optional for Epic. The base and token URLs above are
the defaults when those two variables are omitted.

Oracle Health:

```bash
export LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1
export LASTEHR_BACKEND=oracle
export LASTEHR_MCP_WRITES=proposal
export LASTEHR_FHIR_BASE_URL='https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d'
export LASTEHR_TOKEN_URL='https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token'
export LASTEHR_CLIENT_ID='<system-client-id>'
export LASTEHR_PRIVATE_KEY_PATH='<path-to-pkcs8-pem>'
export LASTEHR_KEY_ID='<jwks-kid>'
export LASTEHR_JWKS_URL='<https-url-of-your-public-jwks>'
export LASTEHR_SCOPES='system/Patient.read system/Observation.read system/Observation.write system/Encounter.read'
export LASTEHR_PERFORMER='<Practitioner/id>'
export LASTEHR_PATIENT_ID='<sandbox-patient-id>'
```

`LASTEHR_SCOPES` is required for Oracle. `LASTEHR_PRIVATE_KEY` may replace
the path. `LASTEHR_ACCESS_TOKEN` skips the assertion. `LASTEHR_BACKEND=smart`
is the same client without the Epic or Oracle observation profile, and it
requires `LASTEHR_FHIR_BASE_URL` and `LASTEHR_TOKEN_URL`.

## One write, on purpose

```bash
npx tsx scripts/sandbox-proof
```

The script shows the shaped Observation, records approval, posts it, and
prints the read-back diff. Epic's proof is a heart rate (flowsheet `8` and
LOINC `8867-4`). Oracle's proof is an oral temperature (LOINC `8331-1`)
with a legal-authenticator performer. LOINC `8867-4` is refused on Oracle
because that sandbox returned HTTP 422. Nothing in the transcript is a
secret, and nothing here says the measurement is clinically correct.

## Still not a supported production backend

- No delete. Writes persist on the shared sandbox.
- Notes, tasks, and superseding observations are refused on Epic and Oracle.
- Search HTTP 403 means the app lacks the search scope.
- Not demo-eligible. Not a compliance claim.
