import { defineConfig, devices } from "@playwright/test";
import { deploymentSiteOrigin } from "./scripts/automation/confirm-deployment.mjs";
const fixture = process.env.TAVERNARY_DEPLOYMENT_FIXTURE_ORIGIN;
export default defineConfig({
  testDir: "./tests/deployment-e2e",
  timeout: 60000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: deploymentSiteOrigin(
      fixture ? { mode: "fixture", fixtureOrigin: fixture } : undefined,
    ),
  },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
});
