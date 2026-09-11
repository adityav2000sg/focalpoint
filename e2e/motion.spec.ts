import { expect, test, type Locator, type Page } from "@playwright/test";
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

/*
 * Contrast of an element's own text against whatever is actually painted behind it.
 * Walks up until it finds an opaque layer, then composites the translucent ones it
 * passed back down, so a glass panel over a card is judged on the real result.
 */
async function contrast(node: Locator) {
  return node.evaluate((el) => {
    const parse = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
    const layers: number[][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const [r, g, b, a = 1] = parse(getComputedStyle(node).backgroundColor);
      if (a > 0) layers.push([r, g, b, a]);
      if (a >= 1) break;
    }
    let [br, bg, bb] = layers.pop() || [255, 255, 255];
    while (layers.length) {
      const [r, g, b, a] = layers.pop()!;
      br = r * a + br * (1 - a); bg = g * a + bg * (1 - a); bb = b * a + bb * (1 - a);
    }
    const [fr, fg, fb, fa = 1] = parse(getComputedStyle(el).color);
    const cr = fr * fa + br * (1 - fa), cg = fg * fa + bg * (1 - fa), cb = fb * fa + bb * (1 - fa);
    const lum = (r: number, g: number, b: number) => {
      const f = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const a1 = lum(cr, cg, cb), a2 = lum(br, bg, bb);
    return (Math.max(a1, a2) + 0.05) / (Math.min(a1, a2) + 0.05);
  });
}

test("text keeps its contrast on every surface, in both themes", async ({ page, isMobile }) => {
  await mock(page);
  await page.goto("/preview");
  await page.waitForTimeout(900);
  const nav = isMobile ? ".mobile-nav button" : ".main-nav button";

  /*
   * This replaces the guard that watched for a pale panel landing on a dark brand
   * card. There are no dark brand cards left — every surface is a neutral plane —
   * so the failure mode it caught cannot happen, and the one that can is the
   * opposite: ink and its surface drifting toward each other until a figure is
   * unreadable. Flattening the palette did exactly that to the three budget
   * figures, which came out white on white; this is the guard for that.
   *
   * 4.5:1 is the WCAG AA floor for text below 18.66px, which covers every target
   * here; the large figures clear it with room to spare.
   */
  const screens: Array<{ view: string; targets: string[] }> = [
    { view: "Today", targets: [".hero-balance", ".hero-label-row", ".quick-action", ".coach-glance-copy strong", ".metric-card > strong"] },
    { view: "Money", targets: [".money-total-card > strong", ".section-tab", ".page-heading h1"] },
    { view: "Future", targets: [".future-hero h2", ".future-stat strong", ".runway-card h3"] },
  ];
  // Budget sits behind a tab rather than the tab bar, so it is reached separately.
  const tabbed: Array<{ tab: string; targets: string[] }> = [
    { tab: "Budget", targets: [".budget-hero h2", ".budget-summary strong", ".budget-summary small", ".plan-row-top"] },
    { tab: "Accounts", targets: [".accounts-hero > div > strong"] },
  ];

  for (const { view, targets } of screens) {
    await page.locator(nav).filter({ hasText: new RegExp(`^${view}$`) }).click();
    await page.waitForTimeout(600);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(250);
      for (const target of targets) {
        const node = page.locator(target).first();
        if (!(await node.count())) continue;
        expect(await contrast(node), `${view} ${target} in ${scheme}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }

  await page.emulateMedia({ colorScheme: "light" });
  await page.locator(nav).filter({ hasText: /^Money$/ }).click();
  await page.waitForTimeout(500);
  for (const { tab, targets } of tabbed) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(600);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(250);
      for (const target of targets) {
        const node = page.locator(target).first();
        if (!(await node.count())) continue;
        expect(await contrast(node), `${tab} ${target} in ${scheme}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
  await page.emulateMedia({ colorScheme: "light" });

  /*
   * The card faces are the one family of surfaces that is still deliberately dark,
   * and they carry white ink in both themes — so they get the guard that suits
   * them: every stop of every gradient stays dark enough for white to clear AA.
   * A gradient has no computed backgroundColor, which is why the walker above
   * cannot judge them and they are checked here instead.
   */
  const faces = await page.locator(".account-card").evaluateAll((cards) =>
    cards.flatMap((card) => {
      const image = getComputedStyle(card).backgroundImage;
      return Array.from(image.matchAll(/rgba?\(([^)]+)\)/g)).map((match) => {
        const [r, g, b, a = 1] = match[1].split(",").map(Number);
        // Composite onto white: a translucent stop is only as dark as what shows.
        const mix = (c: number) => c * a + 255 * (1 - a);
        const f = (c: number) => { const v = mix(c) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return { stop: match[0], ratio: 1.05 / (0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) + 0.05) };
      });
    }),
  );
  expect(faces.length, "account cards should paint a gradient face").toBeGreaterThan(0);
  for (const { stop, ratio } of faces) {
    expect(ratio, `white ink on card stop ${stop}`).toBeGreaterThanOrEqual(4.5);
  }
});
