import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}",
  testDir: "./tests",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      grep: /@tavernkeeper/u,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chromium",
      grep: /@tavernkeeper/u,
      testMatch: /catalog-mobile-performance\.spec\.ts/u,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-webkit",
      grep: /@tavernkeeper/u,
      testMatch: /catalog-mobile-performance\.spec\.ts/u,
      use: { ...devices["iPhone 14"] },
    },
  ],
  use: {
    baseURL: `http://127.0.0.1:${process.env.PORT ?? "3000"}`,
  },
});
