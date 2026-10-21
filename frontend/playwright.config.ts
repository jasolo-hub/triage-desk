import { defineConfig, devices } from "@playwright/test";

// E2E smoke against an ALREADY RUNNING stack — there is deliberately no
// `webServer` block. Before `npm run test:e2e`:
//   - the API on http://localhost:3000/api with the seeded database
//     (admin@triage.dev / agent@triage.dev, password Password123!)
//   - Vite on http://localhost:5173 (`npm run dev -- --port 5173`)
// Override the URLs with E2E_BASE_URL / E2E_API_URL if needed.
export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  timeout: 60_000, // a full ticket lifecycle with several round trips
  expect: { timeout: 10_000 }, // argon2 login + first page load can exceed 5 s on a busy dev machine
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
