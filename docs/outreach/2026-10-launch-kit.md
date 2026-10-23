# October 2026 distribution kit

Prepared October 22, 2026; recording added October 23. These are drafts for Chris to review and send. No posts, messages, demo proposals, or invitations have been submitted.

The first objective is five developer evaluations of one working release. Lead with bounded chart reads, explicit review of each proposed write, and independent checks of what persisted. Other projects already offer FHIR MCP access and review interfaces; do not claim to be the first.

## Release gate before inviting evaluators

**Status: recorded release verified; recording ready; outreach unsent.** On October 22, npm `latest` and the Official MCP Registry were verified at `0.4.0`. The downloaded npm artifact matched the tested tarball's SHA-512 integrity and passed installation checks in a temporary directory outside the checkout. The [GitHub release](https://github.com/cbetz/last-ehr/releases/tag/mcp-v0.4.0) targets the recorded source below. The [90-second synthetic recording](https://www.lastehr.com/demo/approve-and-decline.mp4) and [independent FHIR report](../evidence/demo-approval-2026-10-23.json) are ready; no invitation, post, or proposal has been sent. These pins identify the recorded evaluation baseline, rather than a promise about the current `latest` tag.

| Evaluation detail | Verified value / remaining work |
| --- | --- |
| Tested source tag or commit | [`f36d05dde21c6e1c6847f2660a966afd2615c646`](https://github.com/cbetz/last-ehr/tree/f36d05dde21c6e1c6847f2660a966afd2615c646), tagged `mcp-v0.4.0` |
| Published MCP package version, if used | [`@lastehr/mcp@0.4.0`](https://www.npmjs.com/package/@lastehr/mcp/v/0.4.0); npm `latest` verified as `0.4.0` |
| Exact installation instructions | Pinned commands below and the [quickstart at the tested ref](https://github.com/cbetz/last-ehr/blob/f36d05dde21c6e1c6847f2660a966afd2615c646/docs/quickstart.md#zero-key-local-synthetic-demo-with-hapi-fhir) |
| Test date and operating system | October 22, 2026; GitHub Actions Ubuntu 24.04, Node 22.18.0. [CI run 39856748538](https://github.com/cbetz/last-ehr/actions/runs/39856748538) passed 574 unit tests (4 skipped), 12 browser tests, local HAPI checks, and strict conformance. |
| Synthetic demo recording | [90-second MP4](https://www.lastehr.com/demo/approve-and-decline.mp4), [transcript](../quickstart.md#recorded-approval-and-cancellation), [capture method and limits](../evidence/demo-approval-2026-10-23.md). Captured October 23 from clean `f36d05d`; actual browser approval/cancellation and direct paginated HAPI reads. |
| Browser persistence proof | [Projected report](../evidence/demo-approval-2026-10-23.json): Observation IDs/counts `7 → 7 → 8 → 8 → 8`; exactly one added after approval and none after cancellation. Fixed synthetic request, no external model call. |
| Scrubbed workflow/conformance report | `fhir-agent-safety-eval` and `awp-conformance` artifacts in [CI run 39856748538](https://github.com/cbetz/last-ehr/actions/runs/39856748538), from the tested ref above, against disposable local synthetic HAPI; conformance used `--strict` with AI labeling and Provenance enabled. |
| Later remote MCP checkout proof | [18-check report](../evidence/remote-mcp-2026-10-22.json), October 22, 2026, clean source `e970461`; real Keycloak, local self-hosted Medplum, public HTTPS UserInfo, and scripted SDK decisions. This is separate from the published package artifact checks. |
| Official MCP Registry record | Exact [`0.4.0`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.cbetz%2Flast-ehr/versions/0.4.0) and [`latest`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.cbetz%2Flast-ehr/versions/latest) verified active, pointing to npm `@lastehr/mcp@0.4.0` over stdio; [publication run](https://github.com/cbetz/last-ehr/actions/runs/39860012837) succeeded. |

### Pinned installation

For the fixed synthetic browser walkthrough, start in a clean directory with Node and Docker available. The walkthrough resets and seeds its local synthetic stack; use a disposable stack.

```bash
git clone https://github.com/cbetz/last-ehr.git last-ehr-0.4.0
cd last-ehr-0.4.0
git checkout --detach f36d05dde21c6e1c6847f2660a966afd2615c646
npm ci
npm run demo:local
```

Follow the pinned quickstart's approval, cancellation, independent FHIR checks, and cleanup instructions.

For the published MCP package, verify the pinned version before registering it with a client:

```bash
npx -y @lastehr/mcp@0.4.0 --version
claude mcp add lastehr -- npx -y @lastehr/mcp@0.4.0
```

Configure least-privilege Medplum credentials before connecting that stdio client. For Cursor or portable JSON, `npx -y @lastehr/mcp@0.4.0 init --client cursor` prints a template; change its package argument to `@lastehr/mcp@0.4.0` before saving, because generated templates use an unversioned package name.

Published-package checks covered CLI execution, setup output, HTTP exports, count-only diagnostics, a synthetic MCP read, and the approval capability gate. The later [October 22 checkout harness](../evidence/remote-mcp-2026-10-22.json) passed 18 checks using real Keycloak and local self-hosted Medplum with public HTTPS UserInfo. Hosted Medplum, deployed public MCP TLS, a real host's human approval UI, and actual reviewer identity remain unverified.

Before using the drafts:

- Keep the package version, tested source ref, documentation, and registry record pinned to this verified release. Describe HTTP transport as opt-in; distinguish the later checkout harness proof and retain its hosted Medplum, public MCP TLS, real-host approval UI, and reviewer-identity limits.
- Follow the pinned quickstart on a clean machine or directory. Verify both approval and denial against the FHIR store.
- Use the recording and pinned installation commands above for evaluators. Keep the scripted-mode and evidence limits beside the link.
- Use the [support matrix](../support.md) when describing backends. Medplum is the supported authenticated path. The other web adapters are synthetic evaluation paths; the published MCP package supports Medplum and the repository's local HAPI stack.

The current [local walkthrough](../quickstart.md#zero-key-local-synthetic-demo-with-hapi-fhir) needs Node 22.18+ or 24.2+ and Docker. It is a fixed sequence using Maria Garcia and a heart-rate Observation of 72 bpm. It makes no model-provider request and does not interpret arbitrary prompts. Describe that limitation in the recording and invitation.

## Agents on FHIR proposal

The [official series page](https://www.health-samurai.io/events/agents-on-fhir) accepts proposals for 5–10 minute demos. As checked October 22, it lists calls on October 22 at 3:00 PM ET, October 29 at 9:00 AM ET, and December 3 at 3:00 PM ET, each with a named presentation. Those listings do not establish an available slot. Request the next opening after release verification. Registration and the proposal form are on that page.

### Proposal fields

**Speaker name:** [enter the speaker's name]

**Contact and LinkedIn:** [complete these fields in the form; no contact details are stored here]

**Title / topic:** Did the FHIR agent save exactly what you approved?

**Short abstract:**

> Last EHR is an open-source web app and MCP server for working with FHIR patient charts. I'll show a synthetic workflow where a proposed Observation pauses for review, an approval creates the reviewed resource, and a rejection creates nothing. We'll check the FHIR store directly rather than relying on the assistant's answer. I'll also show the independent conformance runner for MCP write implementations and the limits of its evidence. The question for the group: which failure case should a small implementation like this test next?

**Desired slot:** Next available 5–10 minute demo slot after the tested release is ready; date and time to be confirmed.

**Demo / code links:** [90-second recording](https://www.lastehr.com/demo/approve-and-decline.mp4) · [FHIR report](https://www.lastehr.com/demo/approve-and-decline.proof.json) · [repository](https://github.com/cbetz/last-ehr) · [write protocol](https://www.lastehr.com/docs/agent-write-protocol) · [conformance guide](https://www.lastehr.com/docs/conformance)

### Five-minute run of show

| Time | Show | Say / ask |
| --- | --- | --- |
| 0:00–0:30 | Architecture: browser or MCP client → tools → FHIR backend | “The backend stores the chart and enforces access. This demo uses disposable synthetic records.” |
| 0:30–1:15 | Fixed local Observation proposal | “This walkthrough is scripted. The review and persistence path is real.” Show the patient, value, unit, and FHIR preview. |
| 1:15–2:00 | Approve, then independent FHIR GET | Identify the one new resource and check its patient reference, quantity, coding, and AI label. |
| 2:00–2:45 | Repeat the proposal, reject it, repeat the FHIR GET | Show that the resource ID set has not gained another Observation. |
| 2:45–3:45 | A saved conformance report from the tested ref | Explain that the separate MCP client exercises approval, denial, cancellation, unsupported approval capability, and failure paths. Distinguish this report from the browser demo. |
| 3:45–4:20 | Limits | Creates only; approval does not prove clinical correctness; external model modes send read context to the provider; synthetic alpha. |
| 4:20–5:00 | One concrete question | “Would you help review one additional failure case, or try the local setup for 20 minutes?” |

For a ten-minute slot, spend the additional time on questions and one real failure report. Do not fill it with more product claims.

## Ninety-second synthetic demo storyboard

The [completed recording](https://www.lastehr.com/demo/approve-and-decline.mp4) follows this storyboard with edited timing; see the [actual transcript](../quickstart.md#recorded-approval-and-cancellation). It uses native browser frames beside a pane rendered from direct GET snapshots, rather than a second browser tab. The source, exact read counts, and clean final take are disclosed in the [capture notes](../evidence/demo-approval-2026-10-23.md).

| Time | Screen / action | Voiceover or caption |
| --- | --- | --- |
| 0:00–0:08 | App and local FHIR tab side by side | “Synthetic local walkthrough. Fixed request; no external model call.” |
| 0:08–0:18 | Direct FHIR search: identify the seeded patient, then capture the baseline Observation IDs | “This is the backend before the proposal.” |
| 0:18–0:32 | Submit a message; the scripted sequence finds Maria Garcia and proposes heart rate 72 bpm | “The write is waiting. The proposal is not a saved record.” Open the FHIR preview. |
| 0:32–0:48 | Click **Approve & save**, then repeat the independent Observation query | “One new Observation.” Inspect its ID, `subject`, `valueQuantity`, LOINC code, and `meta.security`. |
| 0:48–1:03 | Submit another message to repeat the same fixed proposal | “Same patient, same measurement. This time I'll decline it.” |
| 1:03–1:18 | Click **Cancel & revise**, then repeat the same backend query | “No additional Observation.” Compare resource IDs with the set immediately after approval. |
| 1:18–1:30 | End card: tested ref, quickstart, report link | “The scripted demo shows persistence mechanics. External model modes use these tools with model-generated requests. This is alpha software for synthetic evaluation.” |

### Direct FHIR verification used in the recording

These are read requests against the local synthetic server, not API calls through the agent. Use a quiet stack with no other writer during the recording. Copy the returned patient ID; do not rely on a hardcoded resource ID.

1. Resolve the seeded patient:

   ```http
   GET http://localhost:8080/fhir/Patient?identifier=https%3A%2F%2Flastehr.com%2Fsynthetic%7Csynthetic-004
   ```

2. Substitute that patient's ID in this query of all their Observations. Save the baseline IDs, query again while the proposal is waiting, after approval, and after cancellation:

   ```http
   GET http://localhost:8080/fhir/Observation?patient=PATIENT_ID&_count=1&_total=accurate
   ```

3. Follow every `Bundle.link` whose `relation` is `next` before comparing ID sets. Check that the accurate `Bundle.total` equals the fully traversed unique match count. The recorded run traversed seven pages before approval and eight after it; one response window is not a full-store count.
4. The approved difference should contain exactly one new Observation with `subject.reference` matching `Patient/PATIENT_ID`, numeric value `72`, unit `bpm`, and LOINC code `8867-4`. Check `meta.security` for code `AIAST` in `http://terminology.hl7.org/CodeSystem/v3-ObservationValue`.
5. While waiting and after cancellation, there should be no additional Observation compared with the preceding baseline. This checks the visible scenario on a quiet local store. The independent [conformance runner](../conformance.md) probes more failure paths; neither check proves clinical correctness or authorization.

Do not imply that the scripted walkthrough reads arbitrary charts or demonstrates model quality. Do not substitute the app's operations panel for independent verification: the panel is useful diagnostics, while the direct GET is a separate read of stored state.

## Medplum community introduction

Use the introduction route linked from Medplum's [contributor guide](https://www.medplum.com/docs/contributing) and [Discord invite](https://discord.gg/medplum). Read the current channel rules and select the relevant channel; a dedicated showcase channel has not been verified. The guide invites introductions and case studies and expects GitHub community standards. Its code-contribution policy also asks new contributors to coordinate an issue before a PR.

Draft, after the release gate is complete:

> Hi, I'm [name], working on Last EHR, an Apache-2.0 project built on Medplum. It provides chart-reading tools plus create-only notes, observations, and tasks, with a human decision before each write.
>
> Medplum already has its own MCP integration. My focus here is a smaller tool surface and testable write behavior: preview a change, approve or decline it, then independently check what reached the FHIR store. This is alpha software and the walkthrough uses synthetic data.
>
> Here's a [90-second example](https://www.lastehr.com/demo/approve-and-decline.mp4) with [independent FHIR checks](https://www.lastehr.com/demo/approve-and-decline.proof.json). The tested setup is [f36d05d, released as MCP 0.4.0](https://github.com/cbetz/last-ehr/blob/f36d05dde21c6e1c6847f2660a966afd2615c646/docs/quickstart.md#zero-key-local-synthetic-demo-with-hapi-fhir). I'm looking for two developers willing to spend 20 minutes installing the local synthetic walkthrough and tell me where it fails or becomes unclear. Would this be useful to review here?

Respect Medplum's [native MCP documentation](https://www.medplum.com/docs/ai/mcp). Also, the [October 8 community prototype](https://www.medplum.com/blog/an-ehr-that-teaches) already describes confirmation of structured entries before saving. Explain the implementation and evidence; do not claim exclusive ownership of human review.

## Twenty-minute evaluator invitation

Use only after an interested developer or community has invited the follow-up. Personalize the opening to their actual work; keep the task unchanged so results can be compared.

**Subject, where needed:** 20-minute synthetic FHIR install test

> I'm looking for five developers to try a small local FHIR agent workflow. Would you spend 20 minutes following the [quickstart at tested source f36d05d](https://github.com/cbetz/last-ehr/blob/f36d05dde21c6e1c6847f2660a966afd2615c646/docs/quickstart.md#zero-key-local-synthetic-demo-with-hapi-fhir) on your own machine? Use the pinned checkout commands in the release kit.
>
> You need Node 22.18+ or 24.2+ and Docker. No Medplum account or model key is needed for this fixed synthetic walkthrough. First-time Docker downloads may take longer than the session; we'll record that time separately.
>
> The task is to start the app, approve one proposed heart-rate Observation, decline the next, and check the results directly in local HAPI FHIR. I'd like to observe where the instructions need help, not coach you through them. Please use only the supplied synthetic records.
>
> The output I need is one setup result, the point where you got stuck if any, and one thing you'd need before trying a real model-backed workflow. A short written report is also useful if a call is inconvenient. There's no production deployment or sales discussion involved.
>
> Code and tested ref: [f36d05d](https://github.com/cbetz/last-ehr/tree/f36d05dde21c6e1c6847f2660a966afd2615c646). Walkthrough: [90-second recording](https://www.lastehr.com/demo/approve-and-decline.mp4). If you're interested, suggest a convenient time or reply here.

For developer communities whose rules discourage AI-generated posts, rewrite these drafts in your own voice. For example, [Health Tech Nerds](https://www.healthtechnerds.com/code-of-conduct) prohibits unsolicited promotion and promotional DMs; it is not a launch-distribution target for this kit.

## Practical article outline

**Working title:** How to test a FHIR agent's write approval

**Reader:** a developer adding tools to an existing clinical application or MCP client.

**Opening example:** A model asks to record a measurement. The interesting questions are when persistence occurs, what the reviewer actually sees, and how to verify a rejection saved nothing.

1. **One request, one proposed resource.** Show the synthetic request and the relevant Observation fields. Explain create-only behavior and what is added as mechanical metadata.
2. **The review boundary.** Trace proposal → explicit decision → backend request. Show the waiting state and the cancel path. Keep backend permissions distinct from human review.
3. **Check the store directly.** Reproduce the approved and denied runs with before/after IDs and field checks. Explain pagination and why an assistant's “saved” message is insufficient evidence.
4. **Exercise the cases a happy-path demo misses.** Unsupported approval capability, decline, cancel, malformed decision, transport failure, duplicate persistence, and changed values. Describe what the conformance runner can and cannot observe.
5. **Try the pinned synthetic example.** Give the verified source ref, prerequisites, tested install steps, expected output, and cleanup. Use a published package command only after it has been smoke-tested.
6. **What this leaves unanswered.** Clinical accuracy, privacy agreements, model behavior, real reviewer identity, and backend access control require separate work. End with one request for a reproducible failing case.

Supporting artifacts: a compact architecture diagram, the 90-second recording, one synthetic resource diff, a scrubbed report stamped with the exact version/ref, and the known-limits paragraph. Publish on the project site or repository first; offer a platform-specific adaptation to interested communities afterward. Do not copy the same announcement across unrelated channels.

## Five developer sessions

Run five separate sessions so one person's setup does not hide another's failure. Prefer two developers familiar with Medplum, two FHIR/backend developers, and one developer new to this repository. These are recruiting targets, not confirmed participants.

### Before each session

- Confirm the release gate and pin the same ref for all five sessions.
- Ask which operating system, Node version, Docker setup, and FHIR experience the evaluator has. Do not request credentials.
- Confirm the ports in the pinned quickstart are available. Warn about any reset/seed command before they run it; use a disposable local stack.
- Ask permission before recording. A written, de-identified observation log is sufficient; collect no patient data or private project information.
- Give the invitation and task, not a preconfigured checkout. Record whether images were already downloaded.

### Twenty-minute task

| Minutes | Evaluator task | Observer records |
| --- | --- | --- |
| 0–3 | Read the instructions and prerequisites | What they think the app will do; misunderstandings about scripted mode or external models |
| 3–10 | Install and start the pinned local walkthrough | Commands attempted, first error, cold download time, active setup time, any coaching |
| 10–14 | Inspect and approve the first proposal | Whether the patient and measurement are clear; independent new resource and field checks |
| 14–17 | Repeat, cancel, verify no additional Observation | Whether cancellation and saved state are understood |
| 17–20 | Explain the result and next useful workflow | One setup issue, one review issue, whether they would try another task |

If downloads use up the session, stop the usability clock and record the cold-start blocker. Continue later only if the evaluator wants to. Do not turn a failed install into a coached success.

### Success criteria for this first round

- At least four of five reach a reviewable proposal within 20 minutes of active setup without code changes or private help. Report cold-start downloads separately.
- Every completed workflow is verified independently: one approved resource, unchanged reviewed fields, no extra resource after cancellation. Any unexplained persistence is a release blocker.
- Each evaluator can explain that this local mode is scripted and synthetic, and that external model modes send chart context to the provider.
- Record every install failure and coaching intervention. Create reproducible follow-up issues for the observed blockers; a missing report is not a success.
- At least two evaluators independently name a useful second workflow or volunteer to try one. Treat this as a small signal of usefulness, not a conversion-rate claim.

Use this observation row for each session:

| Session | OS / Node / Docker | Ref | Cold download time | Active time to proposal | Coaching | Approve verified | Cancel verified | First blocker | Desired next task |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1–5 | | | | | | | | | |

## Ten public prospects

Sources below were checked October 22, 2026. This is a research list of projects and organizations whose public work overlaps the implementation. It does not establish interest, available time, endorsement, or a partnership. Start with the first three routes and recruit five interested developers; do not send ten identical pitches. Use public discussion or organizer routes where appropriate, not unsolicited personal messages. Do not open issue-tracker tickets solely to advertise.

| Prospect | Primary source and evidence of fit | Suitable contribution / ask | Route and constraint |
| --- | --- | --- | --- |
| Medplum community | [Contributor guide](https://www.medplum.com/docs/contributing), [native MCP](https://www.medplum.com/docs/ai/mcp), and an [October 8 open-source application showcase](https://www.medplum.com/blog/an-ehr-that-teaches) | Two local-install evaluations; later, an implementation case study with a reproducible report | Official Discord introduction route. Verify the right channel; acknowledge existing MCP and review implementations. |
| Health Samurai / Agents on FHIR | [Series page](https://www.health-samurai.io/events/agents-on-fhir) invites 5–10 minute demos and lists October 2026 sessions | Demonstrate accept, deny, direct persistence checks, and one conformance failure case; request feedback on the next test | Public proposal form. Request the next available slot; listed sessions are not open-slot promises. |
| HL7 AI Transparency on FHIR project | [Official repository](https://github.com/HL7/aitransparency-ig) and [NIST project update](https://www.nist.gov/programs-projects/hl7-ai-transparency-fast-healthcare-interoperability-resources-fhir) document AI tags and richer Provenance | Review synthetic attribution examples and the representation of the human verifier; contribute an implementer's failure case | [FHIR Chat](https://chat.fhir.org/) / project discussion route. Exact current AI Transparency stream and posting rules remain unverified; obtain routing first. Do not present the local draft as an HL7 standard. |
| Oystehr / Ottehr developers | [Official documentation](https://docs.oystehr.com/) links its Slack and [app-development guidance](https://docs.oystehr.com/oystehr/building-your-workflows-on-oystehr/developing-and-deploying-apps/) | Review the existing synthetic web-adapter recipe and help one developer repeat its contract/eval run | Follow official documentation to Slack or the team contact route. No claim of MCP backend support; no public-channel rules or willingness to co-demo verified. |
| Firely developer team | [Official events](https://fire.ly/events/) and [2026 DevDays recap](https://fire.ly/blog/devdays-2026-recap-fhir/) show a practical FHIR developer community | Review the synthetic Firely adapter recipe and compare one independent persistence check | Official contact/community route. The 2026 DevDays event has passed; do not describe its call for talks as open. The shared public sandbox is not a Last EHR public-demo backend. |
| HAPI FHIR project community | [Project help guidance](https://github.com/hapifhir/hapi-fhir/wiki/Getting-Help) and [official Google Group](https://groups.google.com/g/hapi-fhir/about) | Review a concrete reproducibility problem in the local stack or a minimal FHIR-search test case | Public group for genuine technical questions. First posts are moderated; do not repeat a delayed post or use personal DMs. This is not a generic announcement board. |
| XPC EMR / teaching-EHR project | [Project repository](https://github.com/xprimarycare/xpc-emr), linked from the [October 8 Medplum article](https://www.medplum.com/blog/an-ehr-that-teaches) | Compare one reviewed-write workflow and invite a developer to test the independent denial checks | Existing project discussion or an organizer-introduced conversation if welcomed. Review contribution guidance first; no interest in adopting Last EHR is implied. |
| Flexpa health-agent tooling | [Official health-tool registry docs](https://www.flexpa.com/docs/guides/mcp-registry) and [tool catalog](https://www.flexpa.com/agents) include third-party MCP discovery | Ask what evidence and connection metadata a small FHIR MCP server needs for appropriate discovery; offer a tested entry once the release is consistent | Official project/community contact route. Listing/submission acceptance and criteria have not been verified; do not imply an existing listing. |
| WSO2 FHIR MCP Server project | [Official repository](https://github.com/wso2/fhir-mcp-server) exposes FHIR APIs through MCP and provides a Discussions route | Ask whether one optional approval-gated create workflow would be useful to exercise with an independent manifest and runner | Repository Discussions after checking the project's rules. It is a different tool design; no conformance or adoption claim. |
| FHIR-AgentEval project | [Project repository](https://github.com/YoussefMkst/FHIR-AgentEval) and [October 10 research paper](https://www.nature.com/articles/s41746-026-03348-0) describe deterministic checks of action-oriented FHIR workflows | Offer a concrete approve/deny task and compare how backend state is validated, rather than asking for promotion | Project contribution/discussion route after checking its guidance. Research benchmarks and this gate-mechanics suite measure different things; no shared-results claim. |

### Order of use

1. Complete release verification and the recording.
2. Share one contextual Medplum introduction and submit one Agents on FHIR proposal only when Chris chooses to send them.
3. Run the five developer sessions, fix the observed blockers, and update the pinned instructions.
4. Bring specific implementation evidence to the HL7 discussion. Approach other projects only with a concrete contribution relevant to their work.
5. Publish the practical article with the tested artifacts and actual session findings. Describe the sample size and failures plainly.
