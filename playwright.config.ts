import { defineConfig, devices } from "@playwright/test";

// Padcom runs on a fixed local port (assigned by the artifact system)
const BASE_URL = process.env.PADCOM_BASE_URL || "http://localhost:18148";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    headless: true,
    // Use the system-installed Chromium from Nix
    channel: undefined,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
