# Grok Bot with Last EHR

Connect native Grok Bot to Last's Work MCP service so it can read a bounded
synthetic chart, draft a follow-up request, and check the saved result after
a human approves it in Last. Grok supplies the assistant; Last supplies the
tools, durable work state, separate review, and verified FHIR Task receipt.

## What you can use today

| Route | What is available |
| --- | --- |
| Self-host | The Apache-2.0 repository includes the synthetic Work service and deployment guides. You supply hosting, identity-provider configuration, an assistant identity, and a separate reviewer. |
| Hosted pilot | `work.lastehr.com` is operator configured and allowlisted. It has no self-service enrollment. Knowing its URL or signing in does not grant access. |

The service supports one workspace, one configured reviewer, and one
process. An operator must allow each exact OAuth client/user pair. Each
assistant owns its own work; a new identity cannot retrieve another
assistant's jobs. A shared Bot template does not create a Last workspace,
enroll a user, or supply the author's sign-in.

This guide covers **native Grok Bot**, not a verified integration with
Grok chat at `grok.com`. The separate published `@lastehr/mcp` package exposes
chart tools; this Work service is the checkout's durable draft-and-review
interface.

## Prepare a Work deployment

Follow [Hosted Synthetic Work](./hosted-work.md) or the
[OVHcloud Work Pilot](./ovh-work.md) runbook. Before connecting Grok, have:

- A public HTTPS Work MCP URL and reachable OAuth discovery endpoints.
- A registered public PKCE assistant client, the exact Cursor cloud callback,
  and permission to request `work:assistant offline_access`.
- An operator who can verify and allow the intended assistant user's exact
  client ID/subject pair, distinct from the reviewer subject. A new user's
  subject may only become known after their first provider sign-in.
- A separate human-owned browser signed into Last's configured reviewer.

The hosted guide documents the Auth0 API grant, Google connection setup,
and identity checks. Keep the reviewer's sign-in in that human-owned browser.
Grok's cloud computer and Last's reviewer browser have different jobs.

## Add the connection

Sign into [Cursor Agents](https://cursor.com/agents) with the same account
used by Grok Bot. Open its MCP dropdown and add a personal HTTP server.
In the web configuration editor, use this server map, replacing both
placeholders. The map is not wrapped in a `mcpServers` property:

```json
{
  "Last Work Native": {
    "url": "https://YOUR_WORK_ORIGIN/mcp",
    "auth": {
      "CLIENT_ID": "YOUR_PUBLIC_ASSISTANT_CLIENT_ID",
      "scopes": ["work:assistant", "offline_access"]
    }
  }
}
```

Use the registered public client ID, with no `CLIENT_SECRET` or bearer
header. Choose **Connect** and finish the provider login and consent using
the intended assistant account. Then return to native Grok Bot and check
**Connect apps → Installed** for that connection and its four Work tools.

If consent succeeds but Last rejects access, the operator must verify the
actual provider user and client pair and add it to Last's allowlist. Then
reconnect the same connector. A successful provider login does not enroll
that user in Last.

In the observed test, the native **Authenticate** control did not open the
provider page. Connecting the same configuration through Cursor web
completed authorization; native Grok Bot then used it. If that native button
does nothing, use the web **Connect** route for the existing connection.
An Installed badge alone does not establish authenticated tool access.
[Cursor personal MCP setup](https://cursor.com/docs/cloud-agent/capabilities#custom-mcp-servers),
[Static OAuth configuration](https://cursor.com/docs/mcp#static-oauth-for-remote-servers),
[Grok Bot app connections](https://cursor.com/help/grok-bot/connect-apps)

## Ask for work and review it

Ask in the connected native Bot:

> Use Last Work Native to look at Alex's synthetic chart and draft a follow-up task for me to review.

The configured MCP instructions guide the chart read and proposal. Grok
writes the description; you do not need to supply JSON, a submission key,
or an expected result. Last exposes `read_work_context`, `propose_work`,
`get_work`, and `cancel_work`. It exposes no assistant approval or direct-save
tool.

Open the draft in Last's separate reviewer browser. Inspect the exact
resource and source, then approve or decline it yourself. After approval,
return to the same Grok conversation and ask:

> Approved. Did it save?

Grok should use its retained Work ID to check the result. Saving a Task
records a request; it does not contact a patient or complete care.

## Recorded Grok walkthrough

[Watch the 43-second walkthrough](/demo/grok-work.mp4) ·
[Read the verification record](/demo/grok-work.proof.json)

This silent video is edited from actual screenshots of the October 25, 2026
test in Grok Bot **0.75.8**. It is not a continuous recording. The human
approval happened between captures; the click was not recorded or recreated.

The first request was “In Last, look at Alex's synthetic chart and draft a
follow-up task for me to review.” Grok initially could not find the connector
named Last. The operator clarified that its name was **Last Work Native**,
checked its status, and resumed the ordinary request. This was not first-try
connector discovery. The operator supplied no draft wording, tool arguments,
submission key, expected hash, or expected result.

| Video time | Transcript and visible result |
| --- | --- |
| 00–06 seconds | The resumed request: “Yes. Use Last Work Native to look at Alex's synthetic chart and draft a follow-up task for me to review.” The caption discloses the earlier connector clarification. |
| 06–16 seconds | Grok reports that its follow-up draft is waiting in Last and that no Task has been saved. It summarizes an administrative request for a clinician to review the invented HbA1c result and decide on next steps. |
| 16–25 seconds | Last displays the pending proposal, source, and exact resource for human review. |
| 25–29 seconds | Last shows the approved, saved, verified synthetic Task. The approval click occurs between the genuine captures. |
| 29–39 seconds | The user asks “Approved. Did it save?” Grok answers that Last saved **Task 1053, version 1**, and says this does not mean anyone has contacted Alex. The question supplies no Work ID, Task ID, or hash. |
| 39–43 seconds | The closing card identifies the synthetic demonstration and the project. |

Independent read-only store and FHIR checks found **zero matching Tasks
before human approval and exactly one afterward: `Task/1053`, version `1`**.
The saved fields matched the exact resource approved in Last. Grok's chat
summary omitted a reviewer-name sentence from that resource; the resource
displayed in Last governed the approval.

The native UI did not expose raw MCP payloads or a proposal hash. The evidence
therefore correlates the observed conversation with independently checked
stored state. OAuth authorization completed through Cursor web and was used
by native Grok Bot. An Auth0 refresh exchange was observed, but a native
read after the original access token expired remains unverified.

All chart data is invented. This demonstration does not establish clinical
correctness, real-patient authorization, HIPAA readiness, public self-service,
or compatibility with other assistant clients.
