import { expect, test, type Page } from "@playwright/test";

// End-to-end coverage of the "under the hood" dev-output panel on the
// scripted local stack (NEXT_PUBLIC_DEMO_DEV_OUTPUT=true in the e2e web
// server env). The panel must show the FHIR operations the agent actually
// forwarded to HAPI — and must NEVER show credentials, hosts, or the
// HttpOnly demo session id (the leak assertions here are the DOM-level
// mirror of lib/fhir/observed.test.ts's safety boundary).

async function runScriptedFlowWithPanel(page: Page): Promise<void> {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Under the hood" }).click();
  const composer = page.getByPlaceholder("Run the scripted approval demo…");
  await composer.fill("Run the local scripted approval demo.");
  await composer.press("Enter");
  await expect(page.getByText("Record this observation?")).toBeVisible();
}

function panel(page: Page) {
  return page.getByRole("complementary", { name: "FHIR operations" });
}

test("panel streams the agent's FHIR operations live", async ({ page }) => {
  await runScriptedFlowWithPanel(page);

  // The scripted run's search phase has already hit HAPI by approval time.
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText("GET").first()).toBeVisible();
  await expect(panel(page).getByText(/\/Patient/).first()).toBeVisible();
  // Server-confirmed resolved backend, not the client's guess.
  await expect(panel(page).getByText("Backend: hapi")).toBeVisible();

  // Approving the write adds the POST row.
  await page.getByRole("button", { name: "Approve & save" }).click();
  await expect(page.getByText("✓ Observation recorded.")).toBeVisible();
  await expect(panel(page).getByText("POST").first()).toBeVisible();
  await expect(panel(page).getByText(/\/Observation/).first()).toBeVisible();
});

test("panel never exposes the session id, tokens, or server hosts", async ({
  page,
}) => {
  await runScriptedFlowWithPanel(page);
  await page.getByRole("button", { name: "Approve & save" }).click();
  await expect(page.getByText("✓ Observation recorded.")).toBeVisible();
  await expect(panel(page).getByText("POST").first()).toBeVisible();

  const cookies = await page.context().cookies();
  const sessionId = cookies.find(
    (cookie) => cookie.name === "demo_session_id",
  )?.value;
  expect(sessionId, "quickstart should set demo_session_id").toBeTruthy();

  const panelText = (await panel(page).textContent()) ?? "";
  expect(panelText.length).toBeGreaterThan(0);
  expect(panelText).not.toContain(sessionId as string);
  expect(panelText.toLowerCase()).not.toContain("bearer");
  expect(panelText.toLowerCase()).not.toContain("authorization");
  // The quickstart placeholder token must never surface.
  expect(panelText).not.toContain("local-fhir");
  // Paths are relative; the HAPI host must not appear anywhere in the panel.
  expect(panelText).not.toContain("localhost:8080");
  // Note: the scripted backend issues identifier-based queries, never the
  // _tag session filter, so no session-redacted row exists on this stack;
  // the _tag redaction itself is pinned in lib/fhir/observed.test.ts with
  // the exact searchVisible param shapes.
});

test("New Chat clears the panel", async ({ page }) => {
  await runScriptedFlowWithPanel(page);
  await expect(panel(page).getByText(/\/Patient/).first()).toBeVisible();

  await page.getByRole("button", { name: "New Chat" }).click();
  await expect(panel(page).getByText(/\/Patient/)).toHaveCount(0);
  await expect(
    panel(page).getByText("Send a message and the agent's chart operations", {
      exact: false,
    }),
  ).toBeVisible();
});
