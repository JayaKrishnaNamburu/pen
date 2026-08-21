import { defineConfig, devices } from "@playwright/test";

const EXAMPLES = new Set(["react", "vue", "vanilla"]);
const example = process.env.EXAMPLE ?? "";

if (!EXAMPLES.has(example)) {
	throw new Error(
		`EXAMPLE must be one of ${[...EXAMPLES].join(", ")} (got ${JSON.stringify(example)})`,
	);
}

const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	fullyParallel: true,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
	},
	webServer: {
		command: `pnpm --filter @input/pen-example-${example} exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: false,
		timeout: 60_000,
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
