import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// PROVA DE CONCEITO ISOLADA do Pádua Lottery Engine. Não faz parte do produto nem do e2e do Manager.
// Só abre uma página de teste LOCAL (127.0.0.1). Nenhum site externo é acessado.
const PORT = Number(process.env.POC_PORT || 19099);
export const POC_BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: path.join(__dirname, "tests"),
  outputDir: path.join(__dirname, ".tmp-output", "playwright-artifacts"),
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: POC_BASE_URL,
    headless: true,
    acceptDownloads: true,
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: `node ${path.join(__dirname, "fixture-server.mjs")}`,
    url: `${POC_BASE_URL}/health`,
    env: { POC_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
