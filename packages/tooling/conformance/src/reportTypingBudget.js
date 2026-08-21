import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatDriftReport } from "./typingBudget.js";

const BASELINE = fileURLToPath(
	new URL("../baselines/wave3-typing-budget.chromium.json", import.meta.url),
);
const LAST_RUN = fileURLToPath(
	new URL(
		"../test-results/wave3-typing-budget.chromium.json",
		import.meta.url,
	),
);

function loadJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { error: `${path}: ${message}` };
	}
}

const baseline = loadJson(BASELINE);
const current = loadJson(LAST_RUN);

if ("error" in baseline || "error" in current) {
	const missing = [
		"error" in baseline ? baseline.error : null,
		"error" in current ? current.error : null,
	]
		.filter(Boolean)
		.join("\n");
	// Missing last-run used to exit 0, which is indistinguishable from
	// "compared and nothing drifted". That is the worst case.
	console.error("TYPING_BUDGET_MISSING  could not compare");
	console.error(missing);
	console.error(
		"Run `pnpm --filter @input/pen-conformance run test:typing-budget` to produce the last-run file.",
	);
	process.exit(1);
}

const report = formatDriftReport(baseline, current);
console.log(report.text);
process.exit(0);
