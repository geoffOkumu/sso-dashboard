import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node --import tsx scripts/e2e-server.ts identity",
      url: "http://localhost:3100/api/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: "node --import tsx scripts/e2e-server.ts crm",
      url: "http://localhost:3101/health",
      reuseExistingServer: false,
    },
    {
      command: "node --import tsx scripts/e2e-server.ts analytics",
      url: "http://localhost:3102/health",
      reuseExistingServer: false,
    },
  ],
});
