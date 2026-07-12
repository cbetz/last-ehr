import { expect, test, type Page } from "@playwright/test";

// End-to-end coverage of the demo approval flow. Only the model is mocked
// (the scripted provider behind AI_PROVIDER=scripted): quickstart cookies,
// /api/chat streaming, the in-band approval round-trip, and the HAPI write
// are all real. Requires a seeded local HAPI server on :8080 (CI's
// local-hapi job provisions it; locally run `npm run demo:local:prepare`).

const HAPI_BASE_URL = "http://localhost:8080/fhir";
const SESSION_TAG_SYSTEM = "http://lastehr.demo";

// Drives the scripted sequence up to the pause: send a message, wait for
// search_patients to run against HAPI and record_observation to stop at the
// approval card.
async function startScriptedRun(page: Page): Promise<void> {
  await page.goto("/demo");
  const composer = page.getByPlaceholder("Run the scripted approval demo…");
  await composer.fill("Run the local scripted approval demo.");
  await composer.press("Enter");
  await expect(page.getByText("Record this observation?")).toBeVisible();
}

// Queries HAPI directly for Observations tagged with this browser context's
// demo session, proving persistence (or its absence) against the real FHIR
// server rather than the UI.
async function fetchSessionObservations(
  page: Page,
): Promise<{ resource: { [key: string]: unknown } }[]> {
  const cookies = await page.context().cookies();
  const sessionId = cookies.find(
    (cookie) => cookie.name === "demo_session_id",
  )?.value;
  expect(sessionId, "quickstart should set demo_session_id").toBeTruthy();

  const tag = `${SESSION_TAG_SYSTEM}|session-${sessionId}`;
  const response = await page.request.get(
    `${HAPI_BASE_URL}/Observation?_tag=${encodeURIComponent(tag)}&_count=10`,
  );
  expect(response.ok()).toBe(true);
  const bundle = await response.json();
  return bundle.entry ?? [];
}

test("proposal card shows the pending write, field by field", async ({
  page,
}) => {
  await startScriptedRun(page);

  // exact: true keeps these off the scripted-demo banner ("72 bpm heart-rate
  // observation") and the collapsed FHIR preview JSON.
  await expect(page.getByText("Heart rate", { exact: true })).toBeVisible();
  await expect(page.getByText("72 bpm", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Nothing is saved to the chart until you approve."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel & revise" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve & save" }),
  ).toBeVisible();
});

test("rejecting the proposal writes nothing to HAPI", async ({ page }) => {
  await startScriptedRun(page);

  await page.getByRole("button", { name: "Cancel & revise" }).click();
  await expect(
    page.getByText("The scripted observation was not saved."),
  ).toBeVisible();

  expect(await fetchSessionObservations(page)).toHaveLength(0);
});

test("approving the proposal persists the Observation in HAPI", async ({
  page,
}) => {
  await startScriptedRun(page);

  await page.getByRole("button", { name: "Approve & save" }).click();
  await expect(page.getByText("✓ Observation recorded.")).toBeVisible();
  await expect(
    page.getByText("The scripted observation was saved after approval."),
  ).toBeVisible();

  const entries = await fetchSessionObservations(page);
  expect(entries).toHaveLength(1);
  expect(entries[0].resource).toMatchObject({
    resourceType: "Observation",
    code: { text: "Heart rate" },
    valueQuantity: { value: 72, unit: "bpm" },
  });
});
