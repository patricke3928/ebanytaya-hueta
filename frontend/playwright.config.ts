import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "../backend/.venv/bin/python ../backend/scripts/seed_e2e.py && ../backend/.venv/bin/python -m uvicorn app.main:app --app-dir ../backend --host localhost --port 8000",
      url: "http://localhost:8000/health",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --hostname localhost --port 3000",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
