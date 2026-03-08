import { defineConfig, devices } from "@playwright/test";

const PLAYGROUND_BASE_URL = "http://127.0.0.1:4173";

export default defineConfig({
	testDir: "./playground/e2e",
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	fullyParallel: true,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: PLAYGROUND_BASE_URL,
		trace: "on-first-retry",
	},
	webServer: {
		command: "pnpm --filter @pen/playground dev:e2e",
		url: PLAYGROUND_BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
			},
		},
	],
});
