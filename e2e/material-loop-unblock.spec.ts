import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * The material loop's headline promise: "Receive at the gate — stock, cost AND
 * the blocked task all update." Raising an unmet need auto-blocks its task;
 * receiving the material in full must auto-UNBLOCK it and clear the project's
 * "N tasks blocked by material shortage" banner. This proves the inverse of the
 * block-on-raise transition end-to-end, through the real goods-receipt action.
 *
 * Self-contained: it creates its own project / task / requirement / PO, so it
 * neither depends on nor mutates the seeded procurement fixtures and can run
 * repeatedly against a live database. The PO total is kept below the 50k
 * approval threshold so it auto-releases — no separate approval step needed.
 */

const PASSWORD = "password123";

// Unique per run so the test is idempotent against a persistent dev database.
const STAMP = Date.now().toString(36);
const PROJECT = `Material Loop ${STAMP}`;
const TASK = `Slab pour ${STAMP}`;
const ITEM = `Test rebar ${STAMP}`;
const BANNER = /blocked by material shortage/i;

async function loginAs(page: Page, email: string) {
  // Clear any prior session so we can switch roles within one serial flow.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

/**
 * Click a server-action submit and wait for the action's POST to finish, rather
 * than relying on a form's client-side redirect/close. We then re-navigate and
 * assert on the freshly server-rendered state — robust regardless of how the
 * triggering form chooses to update its own UI afterwards.
 */
async function submitAndWait(page: Page, button: Locator) {
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        !!r.request().headers()["next-action"] &&
        r.status() < 400,
      { timeout: 15_000 },
    ),
    button.click(),
  ]);
}

test.describe.configure({ mode: "serial" });

test("full goods receipt auto-unblocks the task its requirement blocked", async ({
  page,
}) => {
  /* ── PM: project + task + requirement → task auto-blocks ─────────────── */
  await loginAs(page, "pm@buildwell.test");

  await page.goto("/projects");
  await page.getByRole("button", { name: /New project/i }).click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.locator('input[name="name"]').fill(PROJECT);
  await submitAndWait(page, projectDialog.getByRole("button", { name: /Create project/i }));

  // Open the freshly-created project.
  await page.goto("/projects");
  await page.getByText(PROJECT).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 15_000 });
  const projectUrl = page.url();

  // Add a task on the schedule board.
  await page.getByRole("button", { name: /Add task/i }).first().click();
  const taskDialog = page.getByRole("dialog");
  await taskDialog.locator('input[name="name"]').fill(TASK);
  await submitAndWait(page, taskDialog.getByRole("button", { name: /Add task/i }));
  await page.goto(projectUrl);
  await expect(page.getByText(TASK)).toBeVisible();

  // Raise a material need against that task (kept small → PO auto-releases).
  await page.getByRole("tab", { name: /Requirements/i }).click();
  await page.getByRole("button", { name: /Raise requirement/i }).click();
  const reqDialog = page.getByRole("dialog");
  await reqDialog.locator('input[name="itemName"]').fill(ITEM);
  await reqDialog.locator('input[name="quantity"]').fill("10");
  await reqDialog.locator('input[name="estimatedUnitCost"]').fill("100");
  await reqDialog.locator('select[name="taskId"]').selectOption({ label: TASK });
  await submitAndWait(page, reqDialog.getByRole("button", { name: /Raise requirement/i }));

  // The unmet need must flag the task → the project banner appears.
  await page.goto(projectUrl);
  await expect(page.getByText(BANNER)).toBeVisible();

  /* ── Buyer: raise a PO for the need, then submit it ──────────────────── */
  await loginAs(page, "buyer@buildwell.test");
  await page.goto("/requirements");
  const reqRow = page.locator("tr", { hasText: ITEM });
  await reqRow.getByRole("button", { name: /Raise PO/i }).click();
  await page.waitForURL(/\/orders\/new\?requirementId=/);
  // Pick any vendor (index 0 is the "Select vendor" placeholder) and create it.
  await page.locator('select[name="vendorId"]').selectOption({ index: 1 });
  await submitAndWait(page, page.getByRole("button", { name: /Create order/i }));

  // Open the just-created draft PO (its title carries our unique item) and
  // submit it — below the 50k approval threshold it auto-releases, so it's
  // ready to receive without a separate approval step.
  await page.goto("/orders");
  await page.locator("tr", { hasText: ITEM }).locator('a[href^="/orders/"]').first().click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/);
  await submitAndWait(page, page.getByRole("button", { name: /^Submit$/ }));

  /* ── Stores: receive the order in full ───────────────────────────────── */
  await loginAs(page, "stores@buildwell.test");
  await page.goto("/receipts/new");
  // The just-released PO has the highest number → it's the last option, and
  // received-in-full POs drop off this list, so this stays correct across runs.
  const poSelect = page.locator('select[name="poId"]');
  const optionCount = await poSelect.locator("option").count();
  await poSelect.selectOption({ index: optionCount - 1 });
  // Confirm we picked the right order (its line carries our unique item).
  await expect(page.getByText(ITEM)).toBeVisible();
  await submitAndWait(page, page.getByRole("button", { name: /Post goods receipt/i }));

  /* ── PM: the task is unblocked and the banner is gone ────────────────── */
  await loginAs(page, "pm@buildwell.test");
  await page.goto(projectUrl);
  // The headline symptom of the bug — a phantom "blocked by shortage" banner —
  // must be cleared now that the requirement is received in full.
  await expect(page.getByText(BANNER)).toHaveCount(0);
  // And the requirement itself now reads as fully covered.
  await page.getByRole("tab", { name: /Requirements/i }).click();
  await expect(page.getByText(ITEM)).toBeVisible();
  await expect(page.getByText("Covered").first()).toBeVisible();
});
