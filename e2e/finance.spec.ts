import { expect, test, type Page } from "@playwright/test";

async function mockWorkspace(page: Page) {
  let workspace: unknown = null;
  await page.route("**/api/finance", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: workspace, members: [], revisions: { personal: 0, household: null }, inviteUrl: null } });
    const body = route.request().postDataJSON() as { data?: unknown };
    workspace = body.data;
    return route.fulfill({ json: { ok: true, members: [], revisions: { personal: 1, household: null }, inviteUrl: null } });
  });
  await page.route("**/api/coach", (route) => route.fulfill({ json: { configured: false } }));
  await page.route("**/api/history", (route) => route.fulfill({ json: { available: true, entries: [] } }));
}

test("public sign-in and policy pages are usable", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Your finances deserve plain language." })).toBeVisible();
});

test("first-run account and transaction flow updates the dashboard", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/preview");
  await page.getByRole("button", { name: /Add first account/ }).first().click();
  await page.getByLabel("Account name").fill("Everyday");
  await page.getByLabel("Institution").fill("DBS");
  await page.getByLabel("Current value or balance").fill("1000");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await expect(page.getByText("Everyday").first()).toBeVisible();

  await page.getByRole("button", { name: /Capture/ }).locator(":visible").first().click();
  await page.getByRole("button", { name: "Type" }).click();
  await page.getByPlaceholder("Your words appear here…").fill("Spent $12.50 at Yochi");
  await page.getByRole("button", { name: "Review transaction" }).click();
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Yochi", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$987.50").first()).toBeVisible();
});

test("Money controls open the correct flows on mobile", async ({ page, isMobile }) => {
  await mockWorkspace(page);
  await page.goto("/preview");
  await page.locator(isMobile ? ".mobile-nav button" : ".main-nav button").filter({ hasText: /^Money$/ }).click();
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByRole("heading", { name: "Add transaction" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Import" }).first().click();
  await expect(page.getByRole("heading", { name: "Import transactions" })).toBeVisible();
});

test("Settings and private AI consent are reachable", async ({ page, isMobile }) => {
  await mockWorkspace(page);
  await page.goto("/preview");
  if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Recent changes")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).not.toBeVisible();
});

test("Together appears only after a valid invitation is saved", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/preview");
  await expect(page.getByRole("button", { name: "Together", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Set up Together/ }).click();
  await page.getByLabel("Partner or family member").fill("MJ Watson");
  await page.getByLabel("Their sign-in email").fill("mj@example.com");
  await page.getByRole("button", { name: "Save only" }).click();
  await expect(page.getByRole("button", { name: "Together", exact: true }).first()).toBeVisible();
});

test("Goals and future events can be created and edited", async ({ page, isMobile }) => {
  await mockWorkspace(page);
  await page.goto("/preview");
  await page.locator(isMobile ? ".mobile-nav button" : ".main-nav button").filter({ hasText: /^Future$/ }).click();
  await page.getByRole("button", { name: "New goal" }).first().click();
  await page.getByLabel("Goal name").fill("Japan 2028");
  await page.getByLabel("Target amount").fill("20000");
  await page.getByLabel("Target date").fill("2028-04-01");
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByText("Japan 2028", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Plan an event" }).click();
  await page.getByLabel("What are you planning?").fill("Japan spring trip");
  await page.getByLabel("Estimated total cost").fill("12000");
  await page.getByLabel("When").fill("2027-04-01");
  await page.getByRole("button", { name: "Add to forecast" }).click();
  await expect(page.getByText("Japan spring trip", { exact: true })).toBeVisible();
});
