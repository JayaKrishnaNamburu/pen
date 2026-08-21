import assert from "node:assert/strict";
import { test } from "node:test";
import {
	classifyDrift,
	formatDriftReport,
	nearestRankPercentile,
	summarizeTypingBudget,
} from "../typingBudget.js";

const emptySummary = summarizeTypingBudget({
	readPhaseMs: [],
	writePhaseMs: [],
	measureNowPerKeystroke: [],
	flushesPerFrame: [],
	flushCount: 0,
	keystrokeCount: 0,
});

function budget(summary) {
	return {
		summary: { ...emptySummary, ...summary },
		fixture: { contentSha256: "abc" },
	};
}

test("nearest-rank p95 is the last value in a 20-sample series", () => {
	const values = Array.from({ length: 20 }, (_, index) => index + 1);
	assert.equal(nearestRankPercentile(values, 95), 19);
});

test("a 5% p95 time move is quiet and names both numbers", () => {
	const report = formatDriftReport(
		budget({ readPhaseP95Ms: 1, writePhaseP95Ms: 1 }),
		budget({ readPhaseP95Ms: 1.05, writePhaseP95Ms: 1 }),
	);
	assert.equal(report.loud, false);
	assert.equal(report.quietOnly, true);
	assert.match(report.text, /1 ms → 1\.050 ms/);
	assert.match(report.text, /\+5\.0%/);
	assert.match(report.text, /\[quiet\]/);
	assert.doesNotMatch(report.text, /!!!! LOUD DRIFT/);
	assert.equal(
		classifyDrift({ kind: "time", baseline: 1, current: 1.05 }),
		"quiet",
	);
});

test("a 300% p95 time move is loud", () => {
	const report = formatDriftReport(
		budget({ readPhaseP95Ms: 1, writePhaseP95Ms: 1 }),
		budget({ readPhaseP95Ms: 4, writePhaseP95Ms: 1 }),
	);
	assert.equal(report.loud, true);
	assert.match(report.text, /!!!! LOUD DRIFT/);
	assert.match(report.text, /1 ms → 4 ms/);
	assert.match(report.text, /\+300\.0%/);
	assert.equal(
		classifyDrift({ kind: "time", baseline: 1, current: 4 }),
		"loud",
	);
});

test("a flushes-per-frame count change is loud even when the move is +1", () => {
	const report = formatDriftReport(
		budget({ flushesPerFrameMax: 1, flushesPerFrameP95: 1 }),
		budget({ flushesPerFrameMax: 2, flushesPerFrameP95: 2 }),
	);
	assert.equal(report.loud, true);
	assert.match(report.text, /!!!! LOUD DRIFT/);
	assert.match(report.text, /flushesPerFrameMax: 1 → 2/);
	assert.equal(
		classifyDrift({ kind: "count", baseline: 1, current: 2 }),
		"loud",
	);
});

test("identical summaries print no loud drift", () => {
	const same = budget({
		readPhaseP95Ms: 0.4,
		writePhaseP95Ms: 0.2,
		measureNowPerKeystrokeP95: 0,
		measureNowPerKeystrokeMax: 0,
		flushesPerFrameMax: 1,
		flushesPerFrameP95: 1,
		flushCount: 28,
		keystrokeCount: 28,
	});
	const report = formatDriftReport(same, same);
	assert.equal(report.unchanged, true);
	assert.equal(report.loud, false);
	assert.match(report.text, /no loud drift/);
	assert.match(report.text, /record-only/);
});
