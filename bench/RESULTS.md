# Write-safety benchmark results

Runs from this checkout on 2026-11-20 against the repository's local HAPI FHIR stack (`http://127.0.0.1:8080/fhir`). Synthetic fixtures only.

The cells are **pass / fail / n/a** for each category. A fail is a check that ran and did not hold. An n/a was not scored. These rows are not a ranking. The Last EHR row is the scripted harness check: the reference plan calls Last EHR tool names. The other rows are a no-model probe that calls one configured write. They do not show a model following the scenarios.

This file does not score clinical correctness, note quality, or regulatory compliance for any project, including Last EHR. A server with no write tools is not a lower result. The benchmark only measures what happens when an agent writes.

| Server | Pin | Agent | approval-gate | resource-shape | evidence | patient-match | prompt-injection | decline-final | stale-evidence | tool-scope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [Last EHR](https://github.com/cbetz/last-ehr) | `@lastehr/mcp` 0.5.5, this checkout, `FHIR_BACKEND=hapi` | scripted | 6 / 0 / 0 | 4 / 0 / 0 | 2 / 0 / 0 | 3 / 0 / 0 | 4 / 0 / 0 | 1 / 0 / 0 | 3 / 0 / 0 | 3 / 0 / 0 |
| [WSO2 FHIR MCP Server](https://github.com/wso2/fhir-mcp-server) | PyPI `fhir-mcp-server` 0.11.0, tag `0.11.0`, commit `fbb3a74e2cb63eee0eaa50eebaf4887183b6e4a0` | probe (no model) | 0 / 1 / 0 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 |
| [LangCare MCP FHIR](https://github.com/langcare/langcare-mcp-fhir) | npm `@langcare/langcare-mcp-fhir` 2.5.0, commit `430598bb5a76619ef55fa34fb1fd90c65f3d4783` | probe (no model) | 0 / 1 / 0 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 | 0 / 0 / 1 |

Reports, unmodified:

- `bench/results/lastehr-hapi-scripted-2026-11-20.json` at 2026-11-20T15:10:22Z. 26 passed, 0 failed, 0 not applicable.
- `bench/results/wso2-fhir-mcp-server-probe-2026-11-20.json` at 2026-11-20T15:10:41Z. 0 passed, 1 failed, 7 not applicable.
- `bench/results/langcare-mcp-fhir-probe-2026-11-20.json` at 2026-11-20T15:10:50Z. 0 passed, 1 failed, 7 not applicable.

## What the probe recorded

The probe declines an MCP elicitation prompt when the server sends one, then compares the synthetic chart over FHIR REST.

WSO2 `create` changed the chart. The server did not send an MCP elicitation prompt. With or without a client elicitation capability, the listed write tools were `create`, `update`, and `delete`. A tool named `delete` was listed. Whether an agent refrains from calling it was not run.

LangCare `fhir_create` changed the chart. The server did not send an MCP elicitation prompt. With or without a client elicitation capability, the listed write tools were `fhir_create` and `fhir_update`. No listed tool name contained `delete`. Whether an agent refrains from calling a write was not run.

The other categories were not run. They need an agent that follows the scenario text. The scripted plan calls Last EHR tool names, so it is n/a for these servers rather than a fail.

## Reproduce

HAPI, from this checkout:

```bash
docker compose up -d && npm run fhir:wait
```

Last EHR, scripted, after `npm install` and `npm run mcp:build`:

```bash
npm run bench -- --adapter lastehr-hapi
```

WSO2 and LangCare, probe. The harness installs the pinned version under `bench/.cache/` (gitignored). Python 3.12 with `venv` for WSO2. Go 1.25 for LangCare.

```bash
npm run bench:open -- --adapter wso2-fhir-mcp-server --probe
npm run bench:open -- --adapter langcare-mcp-fhir --probe
```

Equivalent server commands, if you start them yourself:

```bash
python3 -m venv .venv && .venv/bin/pip install 'fhir-mcp-server==0.11.0'
FHIR_SERVER_BASE_URL=http://127.0.0.1:8080/fhir FHIR_SERVER_DISABLE_AUTHORIZATION=True \
  .venv/bin/fhir-mcp-server --transport stdio --log-level ERROR
```

```bash
git clone https://github.com/langcare/langcare-mcp-fhir.git
cd langcare-mcp-fhir
git checkout 430598bb5a76619ef55fa34fb1fd90c65f3d4783
go build -o bin/langcare-mcp-fhir ./cmd/server
```

The LangCare process needs `-stdio` and a config whose `fhir_server.base_url` is the HAPI base URL and whose `auth.type` is `none`. The harness writes that file from `bench/servers/langcare-hapi.yaml`.

## Model run

No model key was set in the environment that produced this table (`BENCH_MODEL_API_KEY` and `OPENAI_API_KEY` were unset), so the scenario suite was not run for WSO2 or LangCare.

```bash
export BENCH_MODEL_API_KEY=...
export BENCH_MODEL=gpt-4.1-mini
export BENCH_MODEL_BASE_URL=https://api.openai.com/v1   # optional
npm run bench:open -- --adapter wso2-fhir-mcp-server --agent model --report wso2-model.json
npm run bench:open -- --adapter langcare-mcp-fhir --agent model --report langcare-model.json
```

The harness answers approval prompts. The JSON report includes the system-prompt SHA-256 from `bench/src/agents/model.ts`. A model run can replace the probe row for that server. Keep the report unchanged.

GitHub can run the same commands from `.github/workflows/bench-open.yml` (`workflow_dispatch`). It does not run on pull requests. A model run there uses the `BENCH_MODEL_API_KEY` secret when that secret exists.

## Servers considered and not run

GitHub search on 2026-11-20 for FHIR MCP servers, sorted by stars:

- `healthymind-tech/Taiwan-Health-MCP`, 171 stars. The repository describes a Taiwan terminology and validation toolset. It was not run because it is not a write proxy for a caller-supplied FHIR R4 base URL.
- `the-momentum/fhir-mcp-server`, 102 stars. The README requires OAuth2 client credentials and an encrypted master key (LOINC and Pinecone are separate). It was not run because this harness only targets a plain FHIR R4 base URL with no account.
- WSO2, 139 stars, and LangCare, 75 stars, are the rows above.

Servers whose docs require an Azure, Epic, or Medplum account were not run.

## Add a server

Open a pull request that adds `bench/servers/<id>.json`. Name the write tools, the read tools, whether a write waits on MCP elicitation, and a probe write the harness can call. Pin a version or commit. Synthetic data only.
