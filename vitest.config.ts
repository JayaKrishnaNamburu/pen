import { defineConfig } from "vitest/config";

// CH9 (spec/rules/reliability.md): explicit suite timeout.
// Vitest's 5000ms default is not a chosen budget — selectedTextDeletion.07's
// blockquote-exit case alone takes ~4031ms idle and fails when a worker
// consumes the remaining 20% (11-audit.md F39).
export default defineConfig({
	test: {
		testTimeout: 10_000,
		// GitHub-hosted runners are 4 vCPU and `turbo run test` already fans
		// out every package. Vitest's default (CPU count per package) is how
		// a long core loop starved birpc (`Timeout calling "onTaskUpdate"`)
		// while 101 files were already green. Cap only in CI; local stays
		// unlimited.
		maxWorkers: process.env.CI ? 2 : undefined,
	},
});
