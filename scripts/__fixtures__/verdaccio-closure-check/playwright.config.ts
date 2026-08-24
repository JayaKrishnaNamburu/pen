import { defineConfig, devices } from "@playwright/test";

const hostDir = process.env.PEN_HOST_DIR ?? "";
const port = process.env.PEN_HOST_PORT ?? "";
const testDir = process.env.PEN_SMOKE_DIR ?? "";

if (hostDir.length === 0 || port.length === 0 || testDir.length === 0) {
	throw new Error(
		"PEN_HOST_DIR, PEN_HOST_PORT, and PEN_SMOKE_DIR are required",
	);
}

const BASE_URL = `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir,
	testMatch: "smoke.spec.ts",
	timeout: 30_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	retries: 0,
	reporter: "list",
	use: {
		baseURL: BASE_URL,
		trace: "off",
	},
	webServer: {
		command: `pnpm exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: false,
		timeout: 60_000,
		cwd: hostDir,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
