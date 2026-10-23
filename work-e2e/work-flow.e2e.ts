import { expect, test } from "@playwright/test";

const assistantKey = "assistant-browser-test-00000000000000000000";
const reviewerKey = "reviewer-browser-test-000000000000000000000";
const baseURL = "http://127.0.0.1:3301";

test("assistant draft → separate browser review → independently verified FHIR Task", async ({ browser, request }) => {
  const assistant = await browser.newPage();
  const reviewer = await browser.newPage();
  const errors: string[] = [];
  assistant.on("pageerror", (error) => errors.push(error.message));
  reviewer.on("pageerror", (error) => errors.push(error.message));
  try {
    await assistant.goto(`${baseURL}/assistant`);
    await assistant.getByLabel("Assistant API key").fill(assistantKey);
    await assistant.getByRole("button", { name: "Connect", exact: true }).click();
    const description = `Review the selected synthetic result with the care team. Evaluation ${crypto.randomUUID()}.`;
    await assistant.getByLabel("Follow-up Task", { exact: true }).fill(description);
    await assistant.getByLabel("Due date (optional)").fill("2026-11-01");
    await assistant.getByRole("button", { name: "Submit for review" }).click();
    await expect(assistant.getByText("Pending review", { exact: true })).toBeVisible();
    const jobId = await assistant.getByLabel("Work ID", { exact: true }).inputValue();
    const auth = { authorization: `Bearer ${assistantKey}` };
    const job = (await (await request.get(`${baseURL}/api/work/${jobId}`, { headers: auth })).json()).job;
    const query = new URLSearchParams({ identifier: `https://lastehr.com/work-lab/job|${jobId}`, _total: "accurate" });
    const before = await request.get(`http://127.0.0.1:8080/fhir/Task?${query}`);
    expect((await before.json()).total).toBe(0);

    await reviewer.goto(baseURL);
    await reviewer.getByLabel("Reviewer sign-in key").fill(reviewerKey);
    await reviewer.getByRole("button", { name: "Open inbox" }).click();
    const card = reviewer.locator(`[data-job-id="${jobId}"]`);
    await expect(card.getByText(description, { exact: true })).toBeVisible();
    await expect(card.locator("pre").first()).toContainText(job.proposal.description);
    await expect(card.locator("img")).toHaveCount(0);
    await card.getByRole("button", { name: "Approve and save Task" }).click();
    await expect(card.getByText("Saved to FHIR", { exact: true })).toBeVisible();
    const saved = (await (await request.get(`http://127.0.0.1:8080/fhir/Task?${query}`)).json());
    expect(saved.total).toBe(1);
    const resource = saved.entry[0].resource;
    expect(resource.description).toBe(description);
    expect(resource.for).toEqual(job.proposal.for);
    expect(resource.focus).toEqual(job.proposal.focus);
    expect(resource.restriction.period.end).toBe("2026-11-01");
    await assistant.getByRole("button", { name: "Check status" }).click();
    await expect(assistant.getByText("Saved to FHIR", { exact: true })).toBeVisible();
    await card.screenshot({ path: "artifacts/work-lab/approved-task.png" });
    await reviewer.setViewportSize({ width: 390, height: 844 });
    expect(await reviewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await assistant.close();
    await reviewer.close();
  }
});

test("declining a separately submitted draft leaves no FHIR Task", async ({ page, request }) => {
  const headers = { authorization: `Bearer ${assistantKey}` };
  const { fixture } = await (await request.get(`${baseURL}/api/fixture`, { headers })).json();
  const description = "This synthetic follow-up will be declined. <img src=x onerror=alert(1)>";
  const response = await request.post(`${baseURL}/api/work`, { headers: { ...headers, "idempotency-key": crypto.randomUUID() }, data: { patientId: fixture.patientId, source: fixture.source, description } });
  expect(response.status()).toBe(201);
  const { job } = await response.json();
  await page.goto(baseURL);
  await page.getByLabel("Reviewer sign-in key").fill(reviewerKey);
  await page.getByRole("button", { name: "Open inbox" }).click();
  const card = page.locator(`[data-job-id="${job.id}"]`);
  await expect(card.getByText(description, { exact: true })).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
  await card.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(card.getByText("Declined — no write", { exact: true })).toBeVisible();
  const query = new URLSearchParams({ identifier: `https://lastehr.com/work-lab/job|${job.id}`, _total: "accurate" });
  const persisted = await request.get(`http://127.0.0.1:8080/fhir/Task?${query}`);
  expect((await persisted.json()).total).toBe(0);
});
