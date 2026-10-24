import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import type { AssistantRun } from "../lib/work/assistant";

const assistantKey = "assistant-browser-test-00000000000000000000";
const reviewerKey = "reviewer-browser-test-000000000000000000000";
const baseURL = "http://127.0.0.1:3301";
const assistantHeaders = { authorization: `Bearer ${assistantKey}` };
const scriptedLabel = "SCRIPTED TEST — no model provider";

async function connectAssistant(page: Page) {
  await page.getByLabel("Assistant API key").fill(assistantKey);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator("#model-info")).toHaveText(scriptedLabel);
}

async function prepareFollowUp(page: Page, request: APIRequestContext, evaluation: string): Promise<AssistantRun> {
  await page.goto(`${baseURL}/assistant`);
  await connectAssistant(page);
  const prompt = `Read the selected synthetic HbA1c result and prepare a Task to contact the synthetic patient to arrange follow-up by November 1, 2026. Evaluation ${evaluation}.`;
  await page.getByLabel("What should the assistant prepare?").fill(prompt);
  const submitted = page.waitForResponse((response) => response.url() === `${baseURL}/api/assistant/runs` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Ask assistant", exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(202);
  const { run: accepted } = await response.json() as { run: AssistantRun };
  let run: AssistantRun = accepted;
  await expect.poll(async () => {
    const result = await request.get(`${baseURL}/api/assistant/runs/${accepted.id}`, { headers: assistantHeaders });
    expect(result.ok()).toBe(true);
    ({ run } = await result.json() as { run: AssistantRun });
    return run.state;
  }).toBe("awaiting_review");
  expect(run.modelLabel).toBe(scriptedLabel);
  expect(run.prompt).toBe(prompt);
  expect(run.events.map((event) => event.type)).toEqual(expect.arrayContaining(["chart_read", "drafted", "awaiting_review"]));
  expect(run.job).toBeTruthy();
  const { fixture } = await (await request.get(`${baseURL}/api/fixture`, { headers: assistantHeaders })).json();
  expect(run.job!.proposal).toMatchObject({
    description: "Contact the synthetic patient to arrange follow-up of Demonstration HbA1c result (synthetic) 6.4%.",
    for: { reference: `Patient/${fixture.patientId}` },
    focus: { reference: fixture.source.reference },
    input: [{ type: { text: "Reviewed source version" }, valueString: `${fixture.source.reference}/_history/${fixture.source.versionId}` }],
    restriction: { period: { end: "2026-11-01" } },
  });
  const card = page.locator(`[data-run-id="${run.id}"]`);
  await expect(card.locator(".status").first()).toHaveText("Pending review");
  await expect(card).toContainText(`Read Patient/${fixture.patientId} and ${fixture.source.reference}/_history/${fixture.source.versionId} from the synthetic FHIR server.`);
  await expect(card.locator(`[data-job-id="${run.job!.id}"]`)).toBeVisible();
  return run;
}

async function readTasks(request: APIRequestContext, jobId: string) {
  const query = new URLSearchParams({ identifier: `https://lastehr.com/work-lab/job|${jobId}`, _count: "2", _total: "accurate" });
  const response = await request.get(`http://127.0.0.1:8080/fhir/Task?${query}`);
  expect(response.ok()).toBe(true);
  return await response.json();
}

async function openReview(page: Page) {
  await page.goto(baseURL);
  await page.getByLabel("Reviewer sign-in key").fill(reviewerKey);
  await page.getByRole("button", { name: "Open inbox", exact: true }).click();
}

test("scripted assistant reads chart → drafts work → separate approval → automatic verified result and restored run", async ({ browser, request }) => {
  const assistantContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  const assistant = await assistantContext.newPage();
  const reviewer = await reviewerContext.newPage();
  const errors: string[] = [];
  assistant.on("pageerror", (error) => errors.push(error.message));
  reviewer.on("pageerror", (error) => errors.push(error.message));
  try {
    const run = await prepareFollowUp(assistant, request, crypto.randomUUID());
    const job = run.job!;
    expect((await readTasks(request, job.id)).total).toBe(0);
    await openReview(reviewer);
    expect((await assistantContext.cookies()).some((cookie) => cookie.name === "last_work_reviewer")).toBe(false);
    const reviewCard = reviewer.locator(`[data-job-id="${job.id}"]`);
    await expect(reviewCard.locator("pre").first()).toHaveText(JSON.stringify(job.proposal, null, 2));
    await reviewCard.getByRole("button", { name: "Approve and save Task", exact: true }).click();
    await expect(reviewCard.getByText("Saved to FHIR", { exact: true })).toBeVisible();
    const runCard = assistant.locator(`[data-run-id="${run.id}"]`);
    // The assistant polls the durable run; no manual Check status action is used.
    await expect(runCard.locator(".status").first()).toHaveText("Saved to FHIR", { timeout: 10_000 });
    const finalResponse = await request.get(`${baseURL}/api/assistant/runs/${run.id}`, { headers: assistantHeaders });
    const { run: completed } = await finalResponse.json() as { run: AssistantRun };
    expect(completed.state).toBe("succeeded");
    expect(completed.job?.receipt).toBeTruthy();
    const receipt = completed.job!.receipt!;
    const saved = await readTasks(request, job.id);
    expect(saved.total).toBe(1);
    const { id, meta, ...reviewedFields } = saved.entry[0].resource;
    expect(reviewedFields).toEqual(job.proposal);
    expect(id).toBe(receipt.id);
    expect(meta.versionId).toBe(receipt.versionId);
    await expect(runCard).toContainText(`Last independently verified Task/${id} in FHIR.`);
    await expect(runCard).toContainText("it does not mean the patient has been contacted");
    await assistant.reload();
    await expect(assistant.getByLabel("Assistant API key")).toBeVisible();
    await connectAssistant(assistant);
    const restoredCard = assistant.locator(`[data-run-id="${run.id}"]`);
    await expect(restoredCard.locator(".status").first()).toHaveText("Saved to FHIR");
    await expect(restoredCard).toContainText(`Last independently verified Task/${id} in FHIR.`);
    await expect(restoredCard.locator(`[data-job-id="${job.id}"]`)).toContainText(receipt.verifiedAt);
    expect((await readTasks(request, job.id)).total).toBe(1);
    await restoredCard.screenshot({ path: "artifacts/work-lab/assistant-completed.png" });
    await assistant.setViewportSize({ width: 390, height: 844 });
    expect(await assistant.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await assistantContext.close();
    await reviewerContext.close();
  }
});

test("declined scripted assistant work reports the decision automatically and creates no FHIR Task", async ({ browser, request }) => {
  const assistantContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  const assistant = await assistantContext.newPage();
  const reviewer = await reviewerContext.newPage();
  const errors: string[] = [];
  assistant.on("pageerror", (error) => errors.push(error.message));
  reviewer.on("pageerror", (error) => errors.push(error.message));
  try {
    const run = await prepareFollowUp(assistant, request, crypto.randomUUID());
    const jobId = run.job!.id;
    expect((await readTasks(request, jobId)).total).toBe(0);
    await openReview(reviewer);
    const reviewCard = reviewer.locator(`[data-job-id="${jobId}"]`);
    await reviewCard.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(reviewCard.getByText("Declined — no write", { exact: true })).toBeVisible();
    const runCard = assistant.locator(`[data-run-id="${run.id}"]`);
    await expect(runCard.locator(".status").first()).toHaveText("Declined — no write", { timeout: 10_000 });
    await expect(runCard).toContainText("The reviewer declined the proposal. No Task was saved by this work item.");
    const result = await request.get(`${baseURL}/api/assistant/runs/${run.id}`, { headers: assistantHeaders });
    const { run: declined } = await result.json() as { run: AssistantRun };
    expect(declined.state).toBe("denied");
    expect(declined.job?.receipt).toBeUndefined();
    expect((await readTasks(request, jobId)).total).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await assistantContext.close();
    await reviewerContext.close();
  }
});
