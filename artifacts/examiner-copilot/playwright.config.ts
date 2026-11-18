import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the web app. They run against the Next.js dev server and answer every /api call
 * from an in-memory fake (e2e/fake-api.ts), so they never touch the real database or sign-in.
 */
const port = Number(process.env.E2E_PORT ?? process.env.PORT ?? 22872);

function chromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  try {
    // Replit ships a system Chromium; Playwright's own browser download is not needed.
    return execSync("command -v chromium", { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../../generated-artifacts/examiner-copilot-e2e",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromiumPath() } },
    },
  ],
  webServer: {
    // Reuses the running dev workflow when it is up; otherwise starts one (preview auto sign-in is on in dev).
    command: "pnpm run dev",
    url: `http://localhost:${port}/notices`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { PORT: String(port), BASE_PATH: "/" },
  },
});
