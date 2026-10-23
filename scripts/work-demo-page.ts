/** Static local-lab UI. Untrusted proposal content is rendered with textContent. */
export function workDemoPage(mode: "reviewer" | "assistant"): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Last · Synthetic Work Lab</title><link rel="stylesheet" href="/styles.css"><script src="/app.js" defer></script></head>
<body data-mode="${mode}"><main>
<header><a class="brand" href="/">Last <span>Work Lab</span></a><nav><a href="/">Review inbox</a><a href="/assistant">Assistant</a></nav></header>
<p class="eyebrow">LOCAL · SYNTHETIC DATA ONLY</p>
<h1>${mode === "reviewer" ? "Review proposed follow-up Tasks." : "Prepare a follow-up Task."}</h1>
<p class="intro">${mode === "reviewer" ? "An assistant submits a draft. You review the exact Task before it is saved to FHIR." : "Use the lab’s synthetic patient and result to submit a draft. A separate reviewer decides whether it is saved."}</p>
<p class="boundary">This lab uses separate test credentials, not clinical identity verification. It makes no model-provider request. Never enter real patient information.</p>
<section id="sign-in"><h2>${mode === "reviewer" ? "Reviewer sign-in" : "Assistant connection"}</h2>
<form id="login-form"><label for="key">${mode === "reviewer" ? "Reviewer sign-in key" : "Assistant API key"}</label>
<div class="row"><input id="key" type="password" required autocomplete="off" spellcheck="false"><button type="submit">${mode === "reviewer" ? "Open inbox" : "Connect"}</button></div>
<p class="hint">Use the ${mode === "reviewer" ? "reviewer" : "assistant"} key printed by <code>npm run work:demo</code>.</p></form></section>
<div id="workspace" hidden>
${mode === "assistant" ? `<section><h2>Selected synthetic context</h2><p id="fixture"></p>
<form id="proposal-form"><label for="description">Follow-up Task</label><textarea id="description" rows="3" maxlength="2000" required>Review the selected synthetic result with the care team.</textarea>
<label for="due-date">Due date (optional)</label><input id="due-date" type="date">
<button type="submit">Submit for review</button></form></section>
<section><h2>Work status</h2><form id="lookup-form" class="row"><label for="job-id">Work ID</label><input id="job-id" required><button type="submit">Check status</button></form><div id="jobs"></div></section>` : `<div class="toolbar"><h2>Work inbox</h2><div class="row"><button id="refresh" type="button" class="secondary">Refresh</button><button id="recover" type="button" class="secondary">Reconcile interrupted saves</button><button id="sign-out" type="button" class="secondary">Sign out</button></div></div><div id="jobs"></div>`}
</div><p id="message" role="status" aria-live="polite"></p>
<footer>Saving a Task records a work request. It does not contact the patient or complete the follow-up.</footer>
</main></body></html>`;
}

export const workDemoCss = `
:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#182a2a;background:#f4f5f0}
*{box-sizing:border-box}body{margin:0}main{max-width:980px;margin:auto;padding:24px}header,.toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}header{padding:10px 0 36px}.brand{font-size:26px;font-weight:750;text-decoration:none}.brand span{font-size:15px;font-weight:450;margin-left:8px;color:#536261}nav{display:flex;gap:20px}a{color:#164b46}.eyebrow{font-size:12px;letter-spacing:.15em;color:#52625e;font-weight:700}h1{font-size:clamp(30px,5vw,47px);max-width:740px;line-height:1.1;letter-spacing:-.035em;margin:16px 0}h2{font-size:21px;margin:0 0 16px}h3{margin:0;font-size:18px}.intro{font-size:19px;line-height:1.6;max-width:750px;color:#40534e}.boundary{font-size:14px;line-height:1.6;padding:12px 16px;border-left:3px solid #899b60;background:#eaf0dd}section,.job{background:white;border:1px solid #d6dfd9;border-radius:12px;padding:24px;margin:24px 0}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}label{display:block;font-size:14px;font-weight:650;margin:16px 0 8px}input,textarea{font:inherit;padding:11px 12px;border:1px solid #9caea7;border-radius:6px;min-width:0;max-width:100%;background:white;color:#182a2a}input{flex:1}textarea{width:100%;resize:vertical}button{font:inherit;font-weight:650;padding:12px 16px;border:1px solid #164b46;border-radius:6px;background:#164b46;color:white;cursor:pointer}button.secondary{background:transparent;color:#164b46}button.danger{background:#873c37;border-color:#873c37}button:disabled{cursor:wait;opacity:.6}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #9da349;outline-offset:3px}form>button{margin-top:18px}.hint,footer,.meta{font-size:13px;color:#536261;line-height:1.65}.meta{overflow-wrap:anywhere}.status{font-size:13px;font-weight:700;padding:5px 9px;background:#e8efdf;border-radius:4px}.status[data-state="succeeded"]{background:#d8eee3;color:#195a40}.status[data-state="needs_reconciliation"]{background:#fff0cd;color:#6f4a10}.job-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}pre{max-width:100%;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6;background:#f3f6f2;padding:16px;border-radius:6px}details{margin:16px 0}summary{cursor:pointer;color:#164b46;font-size:14px}#message{min-height:24px;line-height:1.6;overflow-wrap:anywhere}#message[data-error="true"]{color:#873c37}.toolbar{margin-top:28px}footer{border-top:1px solid #d6dfd9;padding-top:20px;margin-top:36px}[hidden]{display:none!important}@media(max-width:550px){main{padding:18px}section,.job{padding:18px}.row input{flex-basis:100%}.toolbar .row{width:100%}nav{gap:14px;font-size:14px}}
`;

export const workDemoScript = `
"use strict";
const mode = document.body.dataset.mode;
const byId = (id) => document.getElementById(id);
let assistantKey = "";
let fixture;
function message(text, error = false) { byId("message").textContent = text; byId("message").dataset.error = String(error); }
async function api(path, options = {}) {
  const headers = { ...(options.body ? {"content-type":"application/json"} : {}), ...(mode === "assistant" ? {authorization:"Bearer " + assistantKey} : {}), ...options.headers };
  const response = await fetch(path, {...options, headers, credentials:"same-origin", cache:"no-store"});
  const data = await response.json();
  if (response.status === 401 && mode === "reviewer" && path !== "/api/reviewer/session") { byId("workspace").hidden = true; byId("sign-in").hidden = false; byId("jobs").replaceChildren(); }
  if (!response.ok) throw new Error(data.message || "The request could not be completed.");
  return data;
}
async function perform(button, action) {
  if (button) button.disabled = true;
  try { message(""); await action(); } catch (error) { message(error instanceof Error ? error.message : "Request failed.", true); }
  finally { if (button) button.disabled = false; }
}
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
const states = {awaiting_review:"Pending review",committing:"Saving — outcome pending",succeeded:"Saved to FHIR",denied:"Declined — no write",cancelled:"Cancelled — no write",expired:"Expired — no write",failed:"Stopped — no write",needs_reconciliation:"Save outcome needs reconciliation"};
function renderJob(job) {
  const card = el("article", undefined, "job"); card.dataset.jobId = job.id;
  const head = el("div", undefined, "job-head"); head.append(el("h3", "Follow-up Task"));
  const state = el("span", states[job.state] || job.state, "status"); state.dataset.state = job.state; head.append(state); card.append(head);
  card.append(el("p", "Work ID: " + job.id, "meta"));
  card.append(el("p", job.proposal.description));
  card.append(el("p", "Patient: " + job.proposal.for.reference + " · Result: " + job.proposal.focus.reference, "meta"));
  card.append(el("p", "Reviewed source version: " + job.input.source.versionId, "meta"));
  if (job.proposal.restriction) card.append(el("p", "Due: " + job.proposal.restriction.period.end, "meta"));
  card.append(el("p", "Review expires: " + job.expiresAt + " · Assigned reviewer: " + job.reviewerSubject + " (lab identity)", "meta"));
  if (job.decision) card.append(el("p", "Decision: " + job.decision.decision + " by " + job.decision.subject + " at " + job.decision.at, "meta"));
  card.append(el("p", "Proposal hash: " + job.proposalHash, "meta"));
  const details = el("details"); details.open = mode === "reviewer" && job.state === "awaiting_review";
  details.append(el("summary", "Exact FHIR resource for review"), el("pre", JSON.stringify(job.proposal, null, 2))); card.append(details);
  if (job.receipt) { const receipt = el("details"); receipt.open = true; receipt.append(el("summary", "Verified persistence receipt"), el("pre", JSON.stringify(job.receipt, null, 2))); card.append(receipt); }
  if (job.failureCode) card.append(el("p", "Outcome: " + job.failureCode, "meta"));
  if (job.state === "awaiting_review") {
    const buttons = el("div", undefined, "row");
    if (mode === "reviewer") {
      for (const [decision, label] of [["approve","Approve and save Task"],["deny","Decline"]]) {
        const button = el("button", label, decision === "deny" ? "secondary" : undefined);
        button.addEventListener("click", () => perform(button, async () => { await api("/api/reviewer/work/" + job.id + "/decision", {method:"POST",body:JSON.stringify({decision,proposalHash:job.proposalHash})}); await loadInbox(); })); buttons.append(button);
      }
    } else {
      const button = el("button", "Cancel pending work", "secondary"); button.addEventListener("click", () => perform(button, async () => { const result = await api("/api/work/" + job.id + "/cancel", {method:"POST"}); showJobs([result.job]); })); buttons.append(button);
    }
    card.append(buttons);
  }
  return card;
}
function showJobs(jobs) { const container = byId("jobs"); container.replaceChildren(); if (!jobs.length) container.append(el("p", "No work yet. Submit a draft from the Assistant page or API.", "meta")); for (const job of jobs) container.append(renderJob(job)); }
async function loadInbox() { const data = await api("/api/reviewer/work"); showJobs(data.jobs); }
async function openWorkspace() {
  if (mode === "reviewer") await loadInbox();
  else { const data = await api("/api/fixture"); fixture = data.fixture; byId("fixture").textContent = fixture.patientLabel + " · " + fixture.resultLabel; }
  byId("workspace").hidden = false; byId("sign-in").hidden = true;
}
byId("login-form").addEventListener("submit", (event) => { event.preventDefault(); perform(event.submitter, async () => {
  if (mode === "reviewer") await api("/api/reviewer/session", {method:"POST",body:JSON.stringify({key:byId("key").value})});
  else assistantKey = byId("key").value;
  await openWorkspace(); byId("key").value = "";
}); });
if (mode === "reviewer") {
  byId("refresh").addEventListener("click", (event) => perform(event.currentTarget, loadInbox));
  byId("recover").addEventListener("click", (event) => perform(event.currentTarget, async () => { await api("/api/reviewer/recover", {method:"POST"}); await loadInbox(); message("Reconciliation checked FHIR. Unresolved outcomes stay blocked; no create was retried."); }));
  byId("sign-out").addEventListener("click", (event) => perform(event.currentTarget, async () => { await api("/api/reviewer/session", {method:"DELETE"}); byId("workspace").hidden = true; byId("sign-in").hidden = false; byId("jobs").replaceChildren(); }));
  openWorkspace().catch(() => {});
} else {
  let submission;
  byId("proposal-form").addEventListener("submit", (event) => { event.preventDefault(); perform(event.submitter, async () => {
    const input = {patientId:fixture.patientId,source:fixture.source,description:byId("description").value,...(byId("due-date").value ? {dueDate:byId("due-date").value} : {})};
    const body = JSON.stringify(input);
    if (!submission || submission.body !== body) submission = {body,key:crypto.randomUUID()};
    const result = await api("/api/work", {method:"POST",headers:{"idempotency-key":submission.key},body});
    byId("job-id").value = result.job.id; showJobs([result.job]); message("Draft submitted. Open the Review inbox and sign in with the separate reviewer key.");
  }); });
  byId("lookup-form").addEventListener("submit", (event) => { event.preventDefault(); perform(event.submitter, async () => { const result = await api("/api/work/" + encodeURIComponent(byId("job-id").value)); showJobs([result.job]); }); });
}
`;
