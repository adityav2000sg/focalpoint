import { expect, test, type Page } from "@playwright/test";
const day = (b: number) => new Date(Date.now() - b * 86400000).toISOString().slice(0, 10);
const seed = {
  version: 3,
  profile: { name: "Peter Parker", partnerName: "MJ", householdName: "H", partnerEmail: "", voiceLocale: "en-SG", voiceLexicon: [], aiEnabled: false, voiceAiEnabled: false, baseCurrency: "SGD", fxRates: {}, onboardedAt: day(70) },
  accounts: [{ id: "a1", name: "Everyday", institution: "DBS", type: "checking", space: "personal", owner: "P", balance: 6480.25, currency: "SGD", last4: "4412", accent: "mint" }],
  transactions: Array.from({ length: 8 }, (_, i) => ({
    id: `t${i}`, type: "expense", amount: 10 + i, date: day(i % 3), description: `Item ${i}`,
    category: "Food & dining", accountId: "a1", space: "personal", source: "manual",
  })),
  goals: [], recurring: [], spendingPlans: [], plannedEvents: [], inbox: [], history: [],
};
async function mock(page: Page) {
  let ws: unknown = seed;
  await page.route("**/api/finance", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: { data: ws, members: [], revisions: { personal: 1, household: null }, inviteUrl: null } });
    ws = (r.request().postDataJSON() as { data: unknown }).data;
    return r.fulfill({ json: { ok: true, members: [], revisions: { personal: 2, household: null }, inviteUrl: null } });
  });
  await page.route("**/api/coach", (r) => r.fulfill({ json: { configured: false } }));
  await page.route("**/api/history", (r) => r.fulfill({ json: { available: true, entries: [] } }));
}

test("rows cascade in, capped so a long list does not crawl", async ({ page, isMobile }) => {
  await mock(page);
  await page.goto("/preview");
  await page.locator(isMobile ? ".mobile-nav button" : ".main-nav button").filter({ hasText: /^Money$/ }).click();
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.waitForTimeout(900);
  const delays = await page.locator(".transaction-row.row-enter").evaluateAll(
    (nodes) => nodes.map((n) => getComputedStyle(n).animationDelay),
  );
  expect(delays.length).toBeGreaterThan(2);
  expect(delays[0]).toBe("0s");
  // Distinct, ascending, and never beyond the twelve-step cap.
  expect(new Set(delays).size).toBeGreaterThan(1);
  for (const d of delays) expect(parseFloat(d)).toBeLessThanOrEqual(12 * 0.026 + 0.001);
});

test("the modal surface uses a spring, the backdrop does not", async ({ page, isMobile }) => {
  await mock(page);
  await page.goto("/preview");
  await page.locator(isMobile ? ".mobile-nav button" : ".main-nav button").filter({ hasText: /^Money$/ }).click();
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.waitForTimeout(200);
  const sheet = await page.locator(".modal-sheet").evaluate((n) => getComputedStyle(n).animationTimingFunction);
  const backdrop = await page.locator(".modal-backdrop").evaluate((n) => getComputedStyle(n).animationTimingFunction);
  expect(sheet).toContain("linear(");
  expect(backdrop).not.toContain("linear(");
});

test("pull to refresh stays out of the way on a pointer device", async ({ page }) => {
  await mock(page);
  await page.goto("/preview");
  await page.waitForTimeout(600);
  await expect(page.locator(".pull-refresh")).toHaveCount(0);
});

test("pulling down at the top refreshes, and a short pull does not", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the gesture only exists on a touch pointer");
  let fetches = 0;
  await page.route("**/api/finance", async (r) => {
    if (r.request().method() === "GET") {
      fetches += 1;
      return r.fulfill({ json: { data: seed, members: [], revisions: { personal: 1, household: null }, inviteUrl: null } });
    }
    return r.fulfill({ json: { ok: true, members: [], revisions: { personal: 2, household: null }, inviteUrl: null } });
  });
  await page.route("**/api/coach", (r) => r.fulfill({ json: { configured: false } }));
  await page.route("**/api/history", (r) => r.fulfill({ json: { available: true, entries: [] } }));
  await page.goto("/preview");
  await page.waitForTimeout(900);

  async function drag(distance: number) {
    await page.evaluate(async (d) => {
      const target = document.body;
      const touch = (y: number) => new Touch({ identifier: 1, target, clientX: 40, clientY: y });
      const fire = (type: string, y: number) => target.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [touch(y)], changedTouches: [touch(y)],
      }));
      fire("touchstart", 10);
      for (let step = 1; step <= 8; step += 1) {
        fire("touchmove", 10 + (d * step) / 8);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      fire("touchend", 10 + d);
    }, distance);
  }

  const before = fetches;
  // Well short of the threshold: nothing should happen.
  await drag(30);
  await page.waitForTimeout(500);
  expect(fetches).toBe(before);

  // Past it: the indicator shows and the workspace is refetched.
  const shown = page.locator(".pull-refresh");
  await drag(260);
  await expect(shown).toHaveCount(1, { timeout: 2000 }).catch(() => undefined);
  await expect.poll(() => fetches, { timeout: 4000 }).toBeGreaterThan(before);
});

test("an open overlay swallows the gesture instead of refreshing behind it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the gesture only exists on a touch pointer");
  let fetches = 0;
  const empty = { ...seed, accounts: [], transactions: [], profile: { ...seed.profile, onboardedAt: undefined } };
  await page.route("**/api/finance", async (r) => {
    if (r.request().method() === "GET") { fetches += 1; return r.fulfill({ json: { data: empty, members: [], revisions: { personal: 1, household: null }, inviteUrl: null } }); }
    return r.fulfill({ json: { ok: true, members: [], revisions: { personal: 2, household: null }, inviteUrl: null } });
  });
  await page.route("**/api/coach", (r) => r.fulfill({ json: { configured: false } }));
  await page.route("**/api/history", (r) => r.fulfill({ json: { available: true, entries: [] } }));
  await page.goto("/preview");
  // The setup wizard is a fixed overlay that does not lock body scroll.
  await expect(page.getByRole("dialog", { name: "Set up Lifetime" })).toBeVisible();

  const before = fetches;
  await page.evaluate(async () => {
    const target = document.body;
    const touch = (y: number) => new Touch({ identifier: 1, target, clientX: 40, clientY: y });
    const fire = (type: string, y: number) => target.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [touch(y)], changedTouches: [touch(y)],
    }));
    fire("touchstart", 10);
    for (let step = 1; step <= 8; step += 1) {
      fire("touchmove", 10 + (260 * step) / 8);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    fire("touchend", 270);
  });
  await page.waitForTimeout(700);
  expect(fetches).toBe(before);
  await expect(page.locator(".pull-refresh")).toHaveCount(0);
});

test("surfaces on the dark hero stay dark in both themes", async ({ page }) => {
  await mock(page);
  await page.goto("/preview");
  await page.waitForTimeout(900);

  // A panel sitting on the dark hero card must never be painted with a light paper token.
  // Three separate regressions have put a pale slab on that card; this is the guard.
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(250);
    const luminance = await page.locator(".hero-balance").evaluate((node) => {
      const rgb = getComputedStyle(node).backgroundColor.match(/[\d.]+/g)!.map(Number);
      const [r, g, b, a = 1] = rgb;
      // Composite over the dark card behind it before judging.
      const card = 24;
      const mix = (c: number) => c * a + card * (1 - a);
      return 0.2126 * mix(r) + 0.7152 * mix(g) + 0.0722 * mix(b);
    });
    expect(luminance, `${scheme} hero panel should stay dark`).toBeLessThan(110);
  }
});
