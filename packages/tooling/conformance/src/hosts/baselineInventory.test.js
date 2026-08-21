/**
 * Enforced-vs-decorative lock for committed baselines. A record-only
 * budget that a reader treats as a gate is how a blown Chromium p95
 * stays green. These assertions read the committed files, not the
 * names or comments.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readPackage(rel) {
	return readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
}

test("wave3 typing-budget baseline is record-only on the numbers", () => {
	const baseline = JSON.parse(readPackage("baselines/wave3-typing-budget.chromium.json"));
	const recordSpec = readPackage("scenarios/sch-typing-budget.record.spec.ts");
	const reporter = readPackage("src/reportTypingBudget.js");
	const formatter = readPackage("src/typingBudget.js");

	assert.equal(baseline.schemaVersion, 1);
	assert.equal(baseline.environment.browser, "chromium");
	assert.equal(typeof baseline.summary.readPhaseP95Ms, "number");
	assert.equal(baseline.versusSpec.readPhaseP95Ms.blown, true);
	assert.ok(baseline.versusSpec.readPhaseP95Ms.measured > baseline.versusSpec.readPhaseP95Ms.budget);

	assert.match(recordSpec, /record \(not assert\) typing-budget/);
	assert.match(recordSpec, /It does not assert the numbers/);
	assert.doesNotMatch(recordSpec, /expect\(\s*drift\.loud/);
	assert.doesNotMatch(recordSpec, /expect\([^\n]*versusSpec/);
	assert.match(recordSpec, /fixture\.contentSha256/);

	assert.match(formatter, /record-only; this run does not fail on these numbers/);
	assert.match(formatter, /SPEC BUDGET BLOWN/);
	assert.match(reporter, /TYPING_BUDGET_MISSING/);
	assert.match(reporter, /process\.exit\(1\)/);
	assert.match(reporter, /process\.exit\(0\)/);
});

test("wave3 fixture identity is the only enforced baseline field", () => {
	const recordSpec = readPackage("scenarios/sch-typing-budget.record.spec.ts");
	assert.match(
		recordSpec,
		/fixture generator changed — re-record the baseline/,
	);
	assert.match(recordSpec, /expect\(\s*\n?\s*fixture\.contentSha256/);
	assert.match(recordSpec, /expect\(baseline\.schemaVersion/);
	assert.doesNotMatch(recordSpec, /expect\([^\n]*readPhaseP95Ms/);
	assert.doesNotMatch(recordSpec, /expect\([^\n]*flushCount/);
	assert.doesNotMatch(
		recordSpec,
		/expect\([^\n]*measureNowPerKeystroke/,
	);
});

test("package test script does not run the record-only budget as a gate", () => {
	const manifest = JSON.parse(readPackage("package.json"));
	assert.match(manifest.scripts.test, /src\/hosts\/\*\.test\.js/);
	assert.doesNotMatch(manifest.scripts.test, /playwright/);
	assert.equal(
		manifest.scripts["report:typing-budget"],
		"node src/reportTypingBudget.js",
	);
	assert.match(manifest.scripts["test:typing-budget"], /record\.spec/);
});

test("reportTypingBudget exits 1 when the last-run file is missing", () => {
	const reporter = fileURLToPath(
		new URL("../reportTypingBudget.js", import.meta.url),
	);
	const lastRun = fileURLToPath(
		new URL(
			"../../test-results/wave3-typing-budget.chromium.json",
			import.meta.url,
		),
	);
	const parked = `${lastRun}.parked-for-missing-test`;
	const hadLastRun = existsSync(lastRun);
	if (hadLastRun) {
		renameSync(lastRun, parked);
	}
	try {
		const result = spawnSync(process.execPath, [reporter], {
			encoding: "utf8",
		});
		assert.equal(result.status, 1, result.stderr || result.stdout);
		assert.match(result.stderr, /TYPING_BUDGET_MISSING/);
		assert.match(result.stderr, /could not compare/);
		assert.doesNotMatch(result.stdout, /TYPING_BUDGET_DRIFT/);
	} finally {
		if (hadLastRun && existsSync(parked)) {
			renameSync(parked, lastRun);
		}
	}
});

test("reportTypingBudget stays exit 0 when last-run exists and the spec is blown", () => {
	const reporter = fileURLToPath(
		new URL("../reportTypingBudget.js", import.meta.url),
	);
	const lastRun = fileURLToPath(
		new URL(
			"../../test-results/wave3-typing-budget.chromium.json",
			import.meta.url,
		),
	);
	const baseline = readPackage("baselines/wave3-typing-budget.chromium.json");
	const hadLastRun = existsSync(lastRun);
	const previous = hadLastRun ? readFileSync(lastRun, "utf8") : null;
	mkdirSync(dirname(lastRun), { recursive: true });
	writeFileSync(lastRun, baseline);
	try {
		const result = spawnSync(process.execPath, [reporter], {
			encoding: "utf8",
		});
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.match(result.stdout, /TYPING_BUDGET_DRIFT/);
		assert.match(result.stdout, /SPEC BUDGET BLOWN/);
		assert.match(result.stdout, /readPhaseP95Ms: measured 3\.4 > budget 2/);
		assert.doesNotMatch(
			result.stdout + result.stderr,
			/TYPING_BUDGET_MISSING/,
		);
	} finally {
		if (previous == null) {
			if (existsSync(lastRun)) {
				unlinkSync(lastRun);
			}
		} else {
			writeFileSync(lastRun, previous);
		}
	}
});

/**
 * Enforced-vs-decorative table. Do not promote a record-only number to
 * blocking here — Chromium read-phase p95 is already blown (3.4 vs 2).
 *
 * | Surface | Field | Status | Why |
 * | wave3-typing-budget.chromium.json | fixture.contentSha256 | ENFORCED | record spec expect() |
 * | wave3-typing-budget.chromium.json | schemaVersion | ENFORCED | record spec expect() |
 * | wave3-typing-budget.chromium.json | summary.* / versusSpec.* | RECORD-ONLY (deliberate) | comments + blown banner |
 * | reportTypingBudget.js | last-run missing | ENFORCED | TYPING_BUDGET_MISSING / exit 1 |
 */
test("enforced-vs-decorative baseline table is complete for this package", () => {
	const baseline = JSON.parse(
		readPackage("baselines/wave3-typing-budget.chromium.json"),
	);
	const recordSpec = readPackage("scenarios/sch-typing-budget.record.spec.ts");
	const reporter = readPackage("src/reportTypingBudget.js");
	const formatter = readPackage("src/typingBudget.js");

	const table = [
		{
			field: "fixture.contentSha256",
			status: "enforced",
			intent: "deliberate",
		},
		{
			field: "schemaVersion",
			status: "enforced",
			intent: "deliberate",
		},
		{
			field: "summary.readPhaseP95Ms",
			status: "record-only",
			intent: "deliberate",
		},
		{
			field: "summary.writePhaseP95Ms",
			status: "record-only",
			intent: "deliberate",
		},
		{
			field: "summary.measureNowPerKeystrokeMax",
			status: "record-only",
			intent: "deliberate",
		},
		{
			field: "summary.flushesPerFrameMax",
			status: "record-only",
			intent: "deliberate",
		},
		{
			field: "versusSpec.readPhaseP95Ms.blown",
			status: "record-only",
			intent: "deliberate-loud",
		},
		{
			field: "reportTypingBudget missing last-run",
			status: "enforced",
			intent: "deliberate",
		},
	];

	assert.equal(table.filter((row) => row.status === "enforced").length, 3);
	assert.ok(
		table.some(
			(row) =>
				row.field === "reportTypingBudget missing last-run" &&
				row.status === "enforced",
		),
	);

	assert.equal(typeof baseline.fixture.contentSha256, "string");
	assert.equal(baseline.schemaVersion, 1);
	assert.equal(baseline.versusSpec.readPhaseP95Ms.blown, true);
	assert.equal(baseline.versusSpec.readPhaseP95Ms.measured, 3.4);
	assert.equal(baseline.versusSpec.readPhaseP95Ms.budget, 2);

	assert.match(recordSpec, /expect\(\s*\n?\s*fixture\.contentSha256/);
	assert.match(recordSpec, /expect\(baseline\.schemaVersion/);
	assert.doesNotMatch(recordSpec, /expect\([^\n]*readPhaseP95Ms/);
	assert.match(recordSpec, /record \(not assert\) typing-budget/);

	assert.match(formatter, /SPEC BUDGET BLOWN/);
	assert.match(reporter, /TYPING_BUDGET_MISSING/);
	assert.match(reporter, /process\.exit\(1\)/);
	assert.equal([...reporter.matchAll(/process\.exit\(0\)/g)].length, 1);
});
