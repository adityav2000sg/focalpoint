import { expect, test, type Page } from "@playwright/test";
const empty = {
  version: 3,
  profile: { name: "Peter Parker", partnerName: "MJ", householdName: "H", partnerEmail: "", voiceLocale: "en-SG", voiceLexicon: [], aiEnabled: false, voiceAiEnabled: false, baseCurrency: "SGD", fxRates: {} },
  accounts: [], transactions: [], goals: [], recurring: [], spendingPlans: [], plannedEvents: [], inbox: [],
};
async function mock(page: Page) {
  let ws: unknown = empty;
  await page.route("**/api/finance", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: { data: ws, members: [], revisions: { personal: 1, household: null }, inviteUrl: null } });
    ws = (r.request().postDataJSON() as { data: unknown }).data;
    return r.fulfill({ json: { ok: true, members: [], revisions: { personal: 2, household: null }, inviteUrl: null } });
  });
  await page.route("**/api/coach", (r) => r.fulfill({ json: { configured: false } }));
  await page.route("**/api/history", (r) => r.fulfill({ json: { available: true, entries: [] } }));
}

test("guided setup writes real records and lands on a populated app", async ({ page }, info) => {
  await mock(page);
  await page.goto("/preview");
  await expect(page.getByRole("dialog", { name: "Set up Lifetime" })).toBeVisible();
  await page.screenshot({ path: `.screens/${info.project.name}-wiz-1.png` });

  await page.getByRole("button", { name: /^Start/ }).click();
  await page.getByRole("button", { name: "USD", exact: true }).click();
  await page.getByRole("button", { name: /^Continue/ }).click();

  await page.getByRole("button", { name: /Savings/ }).click();
  await page.getByLabel("Account name").fill("Emergency");
  await page.getByLabel("Bank or provider").fill("OCBC");
  await page.getByLabel(/Balance today/).fill("18250");
  await page.screenshot({ path: `.screens/${info.project.name}-wiz-2.png` });
  await page.getByRole("button", { name: /^Continue/ }).click();

  await page.getByLabel(/Take-home each month/).fill("6200");
  await page.getByLabel("Next pay date").fill("2026-09-25");
  await page.getByRole("button", { name: /^Continue/ }).click();

  await page.getByLabel("What is it").fill("Rent");
  await page.getByLabel(/^Amount/).fill("2800");
  await page.getByLabel("Next due").fill("2026-09-15");
  await page.getByRole("button", { name: /^Continue/ }).click();

  await page.getByLabel("The goal").fill("Japan");
  await page.getByLabel(/How much/).fill("12000");
  await page.getByLabel("By when").fill("2027-04-01");
  await page.getByRole("button", { name: /^Continue/ }).click();

  await page.getByRole("button", { name: /^Continue/ }).click();
  await page.screenshot({ path: `.screens/${info.project.name}-wiz-3.png` });
  await page.getByRole("button", { name: /Open Lifetime/ }).click();

  await expect(page.getByRole("dialog", { name: "Set up Lifetime" })).toHaveCount(0);
  // The account, the salary and the bill are all real records now.
  await expect(page.getByText("Emergency").first()).toBeVisible();
  await expect(page.getByText("Rent").first()).toBeVisible();
  await page.screenshot({ path: `.screens/${info.project.name}-wiz-4.png` });
});

test("setup can be skipped and does not come back", async ({ page }) => {
  await mock(page);
  await page.goto("/preview");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page.getByRole("dialog", { name: "Set up Lifetime" })).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.getByRole("dialog", { name: "Set up Lifetime" })).toHaveCount(0);
});
