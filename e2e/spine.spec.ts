import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "password123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test.describe.configure({ mode: "serial" });

test("login renders the role-aware dashboard", async ({ page }) => {
  await login(page, "pm@buildwell.test");
  await expect(page.getByText("Welcome, Rajesh")).toBeVisible();
});

test("PM creates a project end-to-end", async ({ page }) => {
  await login(page, "pm@buildwell.test");
  await page.goto("/projects");
  await page.getByRole("button", { name: /New project/i }).click();
  await page.fill('input[name="name"]', "E2E Verification Tower");
  await page.fill('input[name="clientName"]', "QA Client");
  await page.fill('input[name="budget"]', "1000000");
  await page.getByRole("button", { name: /Create project/i }).click();
  // createProject redirects to the new project's detail page
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Verification Tower" })).toBeVisible();
  // the auto-seeded WBS template tab exists
  await expect(page.getByRole("tab", { name: /Budget/i })).toBeVisible();
});

test("PM raises a requirement on the new project", async ({ page }) => {
  await login(page, "pm@buildwell.test");
  await page.goto("/projects");
  await page.getByText("E2E Verification Tower").click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
  await page.getByRole("tab", { name: /Requirements/i }).click();
  await page.getByRole("button", { name: /Raise requirement/i }).click();
  await page.fill('input[name="itemName"]', "Diesel generator 250kVA");
  await page.fill('input[name="quantity"]', "2");
  await page.getByRole("button", { name: /Raise requirement/i }).last().click();
  await expect(page.getByText("Diesel generator 250kVA")).toBeVisible();
});

test("Finance approves the pending PO (release + commitment)", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // accept the confirm() guard
  await login(page, "finance@buildwell.test");
  await page.goto("/approvals");
  await expect(page.getByText(/PO-0002/)).toBeVisible();
  const pendingRow = page.locator("tr", { hasText: "PO-0002" }).filter({
    has: page.getByRole("button", { name: /^Approve/i }),
  });
  await pendingRow.getByRole("button", { name: /^Approve/i }).click();
  // after decideApproval commits + refresh, the pending Approve action is gone
  await expect(pendingRow.getByRole("button", { name: /^Approve/i })).toHaveCount(0);
});

test("Storekeeper sees the released PO in deliveries", async ({ page }) => {
  await login(page, "stores@buildwell.test");
  await page.goto("/deliveries");
  await expect(page.getByText(/PO-0002/)).toBeVisible();
});

test("Finance records a payment on an invoice", async ({ page }) => {
  await login(page, "finance@buildwell.test");
  await page.goto("/billing");
  await page.getByText(/INV-0001/).click();
  await page.waitForURL(/\/billing\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: /Record payment/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.fill('input[name="amount"]', "500000");
  await page.getByRole("dialog").getByRole("button", { name: /Record payment/i }).click();
  // FormDialog only closes when the action returns ok
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
