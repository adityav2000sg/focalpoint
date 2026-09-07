import { defineConfig } from "@playwright/test";

/**
 * App Store listing screenshots. Separate from the regression suite because it renders at
 * Apple's exact required pixel sizes rather than at realistic test viewports.
 *
 * Sizes come from App Store Connect's screenshot specifications: 6.9" iPhone at
 * 1320x2868 and 13" iPad at 2064x2752 are the two that are mandatory for an app that
 * runs on both, which this one does (TARGETED_DEVICE_FAMILY = "1,2").
 *
 * Output is JPEG because App Store Connect rejects images carrying an alpha channel.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/store-screenshots.spec.ts",
  reporter: "list",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100" },
  projects: [
    {
      name: "iphone-6.9",
      use: { browserName: "chromium", channel: process.env.CI ? undefined : "chrome", viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: "ipad-13",
      use: { browserName: "chromium", channel: process.env.CI ? undefined : "chrome", viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: "STORE_SCREENSHOTS=1 E2E_BYPASS_AUTH=1 NEXT_PUBLIC_APPLE_AUTH_ENABLED=true npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
