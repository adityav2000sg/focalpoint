import { expect, test, type Page } from "@playwright/test";
export const day = (b: number) => new Date(Date.now() - b * 86400000).toISOString().slice(0, 10);
const history = Array.from({ length: 90 }, (_, i) => {
  const v = 38500 + i * 235 + Math.sin(i / 7) * 1450;
  return { date: day(89 - i), netWorth: +v.toFixed(2), liquid: +(v * .58).toFixed(2), investments: +(v * .47).toFixed(2), liabilities: +(v * .05).toFixed(2), currency: "SGD" };
});
export const seed = {
  version: 3,
  profile: { name: "Peter Parker", partnerName: "MJ", householdName: "Our Home", partnerEmail: "", voiceLocale: "en-SG", voiceLexicon: [], aiEnabled: false, voiceAiEnabled: false, baseCurrency: "SGD", fxRates: {}, onboardedAt: day(90) },
  accounts: [
    { id: "a1", name: "Everyday", institution: "DBS", type: "checking", space: "personal", owner: "Peter", balance: 6480.25, currency: "SGD", last4: "4412", accent: "mint" },
    { id: "a2", name: "Emergency", institution: "OCBC", type: "savings", space: "personal", owner: "Peter", balance: 24800, currency: "SGD", last4: "8871", accent: "sky" },
    { id: "a3", name: "Platinum", institution: "Amex", type: "credit", space: "personal", owner: "Peter", balance: -862.4, currency: "SGD", last4: "1003", accent: "coral" },
    { id: "a4", name: "Brokerage", institution: "IBKR", type: "investment", space: "personal", owner: "Peter", balance: 24455, currency: "SGD", accent: "violet" },
  ],
  transactions: [
    { id: "t1", type: "income", amount: 7400, date: day(3), description: "Salary", category: "Income", accountId: "a1", space: "personal", source: "manual" },
    { id: "t2", type: "expense", amount: 13.8, date: day(0), description: "Yochi", category: "Food & dining", accountId: "a1", space: "personal", source: "voice" },
    { id: "t3", type: "expense", amount: 248.9, date: day(0), description: "Cold Storage", category: "Groceries", accountId: "a3", space: "personal", source: "sheet" },
    { id: "t4", type: "expense", amount: 89.4, date: day(1), description: "Grab", category: "Transport", accountId: "a1", space: "personal", source: "manual" },
    { id: "t5", type: "expense", amount: 42.5, date: day(1), description: "Sheng Siong", category: "Groceries", accountId: "a1", space: "personal", source: "manual" },
    { id: "t6", type: "transfer", amount: 2000, date: day(2), description: "To Emergency", category: "Transfer", accountId: "a1", transferAccountId: "a2", space: "personal", source: "manual" },
    { id: "t7", type: "expense", amount: 310, date: day(4), description: "Utilities", category: "Home", accountId: "a1", space: "personal", source: "recurring" },
    { id: "t8", type: "expense", amount: 18.9, date: day(5), description: "Spotify", category: "Entertainment", accountId: "a1", space: "personal", source: "recurring" },
  ],
  goals: [{ id: "g1", name: "Japan, next spring", target: 12000, current: 7400, targetDate: day(-240), space: "personal", icon: "plane", monthlyContribution: 700, priority: "important", currency: "SGD" }],
  recurring: [
    { id: "r1", name: "Rent", amount: 2800, cadence: "monthly", nextDate: day(-3), accountId: "a1", category: "Home", space: "personal", active: true },
    { id: "r2", name: "Insurance", amount: 180, cadence: "monthly", nextDate: day(-9), accountId: "a1", category: "Health", space: "personal", active: true },
  ],
  spendingPlans: [{ id: "p1", category: "Groceries", monthlyLimit: 900, space: "personal" }],
  plannedEvents: [{ id: "e1", name: "Flights to Osaka", amount: 2400, date: day(-120), kind: "travel", space: "personal", includeInPlan: true, currency: "SGD" }],
  inbox: [], history,
};
export async function mock(page: Page, data: unknown = seed) {
  let ws: unknown = data;
  await page.route("**/api/finance", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: { data: ws, members: [], revisions: { personal: 9, household: null }, inviteUrl: null } });
    ws = (r.request().postDataJSON() as { data: unknown }).data;
    return r.fulfill({ json: { ok: true, members: [], revisions: { personal: 10, household: null }, inviteUrl: null } });
  });
  await page.route("**/api/coach", (r) => r.fulfill({ json: { configured: false } }));
  await page.route("**/api/history", (r) => r.fulfill({ json: { available: true, entries: [] } }));
}

test("the hero figure actually counts up on load", async ({ page }) => {
  await mock(page);
  await page.goto("/preview");
  const hero = page.locator(".hero-balance strong, .hero-balance").first();
  await hero.waitFor();
  const samples: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    samples.push((await hero.innerText()).trim());
    await page.waitForTimeout(70);
  }
  const distinct = new Set(samples.filter(Boolean));
  // A snap would give one value for every sample; a count-up gives many.
  expect(distinct.size).toBeGreaterThan(4);
  await page.waitForTimeout(1400);
  expect((await hero.innerText())).toContain("54,872");
});


test("the ledger is reachable without scrolling on a phone", async ({ page, isMobile }) => {
  await mock(page);
  await page.goto("/preview");
  await page.locator(isMobile ? ".mobile-nav button" : ".main-nav button").filter({ hasText: /^Money$/ }).click();
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.waitForTimeout(1200);
  const { viewport, firstRow } = await page.evaluate(() => {
    const row = document.querySelector(".transaction-row") as HTMLElement | null;
    return { viewport: window.innerHeight, firstRow: row ? Math.round(row.getBoundingClientRect().top + window.scrollY) : Infinity };
  });
  // This sat at 654px in a 664px viewport — the whole screen was chrome. Guard the win:
  // the first row must leave room for at least a couple more beneath it.
  expect(firstRow).toBeLessThan(viewport - 120);
});

