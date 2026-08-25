/**
 * Wave 3.5 record-only typing budget. Compares a run to the committed
 * baseline and formats drift. Never decides pass/fail on the numbers —
 * Wave 7 flips the counts to assertions. A 5% p95 move is quiet on
 * purpose; a count change is loud because counts are machine-independent.
 *
 * Spec budgets stay at the wave-doc targets (read-phase p95 = 2ms). The
 * committed Chromium recording is already 3.4ms, so versusSpec.blown is
 * true on purpose. Raising the budget to hide that would launder the
 * number; failing the tree on it would fail on a measurement that does
 * not describe the product.
 * The report must print a blown spec as a loud banner. Missing last-run
 * is a hard fail in reportTypingBudget.js — silent pass is the worst case.
 *
 * What 3.4ms is NOT (corrected 2026-08-23, spec-v2/evidence/SCHEDULER-WIRING-AUDIT.md):
 * it is not a product overrun. The timed flush belongs to a second
 * DomScheduler the harness constructs, and caretRect is inside the timed
 * region only because the harness queued it — acceptCommit has zero
 * production callers, so a real keystroke never runs that flush. All four
 * metrics are harness numbers; the production read phase is unmeasured,
 * and becomes measurable when the scheduler is on the apply path.
 */

/**
 * @param {readonly number[]} values
 * @param {number} percentile
 * @returns {number | null}
 */
export function nearestRankPercentile(values, percentile) {
	if (values.length === 0) {
		return null;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const rank = Math.ceil((percentile / 100) * sorted.length);
	const index = Math.min(sorted.length, Math.max(1, rank)) - 1;
	const value = sorted[index];
	return value === undefined ? null : value;
}

/**
 * @param {readonly number[]} values
 */
export function sampleStats(values) {
	if (values.length === 0) {
		return {
			count: 0,
			min: null,
			max: null,
			mean: null,
			p50: null,
			p95: null,
		};
	}
	const sum = values.reduce((total, value) => total + value, 0);
	return {
		count: values.length,
		min: Math.min(...values),
		max: Math.max(...values),
		mean: sum / values.length,
		p50: nearestRankPercentile(values, 50),
		p95: nearestRankPercentile(values, 95),
	};
}

/**
 * @param {number | null | undefined} baseline
 * @param {number | null | undefined} current
 */
export function signedDelta(baseline, current) {
	if (baseline == null || current == null) {
		return { abs: null, pct: null };
	}
	const abs = current - baseline;
	if (baseline === 0) {
		return { abs, pct: current === 0 ? 0 : null };
	}
	return { abs, pct: (abs / baseline) * 100 };
}

/**
 * Counts are the enforceable signal. Timings are soft.
 *
 * @param {{ kind: "count" | "time"; baseline: number | null; current: number | null }} metric
 * @returns {"none" | "quiet" | "loud"}
 */
export function classifyDrift(metric) {
	const { abs, pct } = signedDelta(metric.baseline, metric.current);
	if (metric.baseline == null || metric.current == null || abs == null) {
		return "none";
	}
	if (abs === 0) {
		return "none";
	}
	if (metric.kind === "count") {
		return "loud";
	}
	if (pct == null) {
		return metric.current === 0 ? "quiet" : "loud";
	}
	if (Math.abs(pct) >= 50) {
		return "loud";
	}
	return "quiet";
}

/**
 * @param {string} name
 * @param {"count" | "time"} kind
 * @param {number | null | undefined} baseline
 * @param {number | null | undefined} current
 * @param {string} [unit]
 */
export function formatMetricLine(name, kind, baseline, current, unit = "") {
	const suffix = unit ? ` ${unit}` : "";
	const level = classifyDrift({
		kind,
		baseline: baseline ?? null,
		current: current ?? null,
	});
	if (baseline == null && current == null) {
		return { name, kind, level, line: `${name}: (no samples)` };
	}
	const { abs, pct } = signedDelta(baseline, current);
	const baselineText =
		baseline == null ? "n/a" : `${formatNumber(baseline)}${suffix}`;
	const currentText =
		current == null ? "n/a" : `${formatNumber(current)}${suffix}`;
	let deltaText = "n/a";
	if (abs != null) {
		const signed = `${abs >= 0 ? "+" : ""}${formatNumber(abs)}${suffix}`;
		deltaText =
			pct == null
				? signed
				: `${signed} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
	}
	return {
		name,
		kind,
		level,
		line: `${name}: ${baselineText} → ${currentText}  ${deltaText}  [${level}]`,
	};
}

/**
 * @param {number} value
 */
function formatNumber(value) {
	if (Number.isInteger(value)) {
		return String(value);
	}
	return value.toFixed(3);
}

/**
 * @typedef {object} TypingBudgetSummary
 * @property {number | null} readPhaseP95Ms
 * @property {number | null} writePhaseP95Ms
 * @property {number | null} measureNowPerKeystrokeP95
 * @property {number | null} measureNowPerKeystrokeMax
 * @property {number | null} flushesPerFrameMax
 * @property {number | null} flushesPerFrameP95
 * @property {number} flushCount
 * @property {number} keystrokeCount
 */

/**
 * @param {{ summary: TypingBudgetSummary }} baseline
 * @param {{ summary: TypingBudgetSummary }} current
 */
export function compareTypingBudgets(baseline, current) {
	const lines = [
		formatMetricLine(
			"readPhaseP95Ms",
			"time",
			baseline.summary.readPhaseP95Ms,
			current.summary.readPhaseP95Ms,
			"ms",
		),
		formatMetricLine(
			"writePhaseP95Ms",
			"time",
			baseline.summary.writePhaseP95Ms,
			current.summary.writePhaseP95Ms,
			"ms",
		),
		formatMetricLine(
			"measureNowPerKeystrokeP95",
			"count",
			baseline.summary.measureNowPerKeystrokeP95,
			current.summary.measureNowPerKeystrokeP95,
		),
		formatMetricLine(
			"measureNowPerKeystrokeMax",
			"count",
			baseline.summary.measureNowPerKeystrokeMax,
			current.summary.measureNowPerKeystrokeMax,
		),
		formatMetricLine(
			"flushesPerFrameMax",
			"count",
			baseline.summary.flushesPerFrameMax,
			current.summary.flushesPerFrameMax,
		),
		formatMetricLine(
			"flushesPerFrameP95",
			"count",
			baseline.summary.flushesPerFrameP95,
			current.summary.flushesPerFrameP95,
		),
		formatMetricLine(
			"flushCount",
			"count",
			baseline.summary.flushCount,
			current.summary.flushCount,
		),
		formatMetricLine(
			"keystrokeCount",
			"count",
			baseline.summary.keystrokeCount,
			current.summary.keystrokeCount,
		),
	];
	const loud = lines.filter((entry) => entry.level === "loud");
	const quiet = lines.filter((entry) => entry.level === "quiet");
	return { lines, loud, quiet };
}

/**
 * @param {Record<string, { budget?: unknown; measured?: unknown; blown?: unknown }> | undefined} versusSpec
 */
export function collectBlownSpec(versusSpec) {
	if (versusSpec == null || typeof versusSpec !== "object") {
		return [];
	}
	const rows = [];
	for (const [name, entry] of Object.entries(versusSpec)) {
		if (
			entry == null ||
			typeof entry !== "object" ||
			entry.blown !== true
		) {
			continue;
		}
		rows.push({
			name,
			measured: entry.measured,
			budget: entry.budget,
			line: `  ${name}: measured ${entry.measured} > budget ${entry.budget}  [blown]`,
		});
	}
	return rows;
}

/**
 * @param {{ summary: TypingBudgetSummary; fixture?: { contentSha256?: string }; versusSpec?: object }} baseline
 * @param {{ summary: TypingBudgetSummary; fixture?: { contentSha256?: string }; versusSpec?: object }} current
 */
export function formatDriftReport(baseline, current) {
	const compared = compareTypingBudgets(baseline, current);
	const header = [
		"TYPING_BUDGET_DRIFT  record-only; this run does not fail on these numbers",
		"quiet = time moved <50% (a 5% p95 move is quiet — reviewers will not see a git diff unless someone re-records)",
		"loud  = a count moved, or a time moved ≥50%. Wave 7 can enforce the counts.",
	];
	const fixtureLine =
		baseline.fixture?.contentSha256 && current.fixture?.contentSha256
			? `fixture sha256: ${current.fixture.contentSha256}${
					baseline.fixture.contentSha256 ===
					current.fixture.contentSha256
						? " (unchanged)"
						: ` (CHANGED from ${baseline.fixture.contentSha256})`
				}`
			: "fixture sha256: (missing)";
	const body = compared.lines.map((entry) => entry.line);
	const banner =
		compared.loud.length > 0
			? [
					"",
					"!!!! LOUD DRIFT — counts or large timing moves !!!!",
					...compared.loud.map((entry) => `  ${entry.line}`),
				]
			: ["", "no loud drift"];
	const blown = collectBlownSpec(current.versusSpec ?? baseline.versusSpec);
	const specBanner =
		blown.length > 0
			? [
					"",
					"!!!! SPEC BUDGET BLOWN (record-only — this run does not fail on these numbers) !!!!",
					...blown.map((row) => row.line),
				]
			: [];
	const text = [
		...header,
		"",
		fixtureLine,
		"",
		...body,
		...banner,
		...specBanner,
	].join("\n");
	return {
		text,
		loud: compared.loud.length > 0,
		specBlown: blown.length > 0,
		quietOnly: compared.loud.length === 0 && compared.quiet.length > 0,
		unchanged: compared.loud.length === 0 && compared.quiet.length === 0,
		lines: compared.lines,
	};
}

/**
 * @param {object} args
 * @param {readonly number[]} args.readPhaseMs
 * @param {readonly number[]} args.writePhaseMs
 * @param {readonly number[]} args.measureNowPerKeystroke
 * @param {readonly number[]} args.flushesPerFrame
 * @param {number} args.flushCount
 * @param {number} args.keystrokeCount
 * @returns {TypingBudgetSummary}
 */
export function summarizeTypingBudget(args) {
	const read = sampleStats(args.readPhaseMs);
	const write = sampleStats(args.writePhaseMs);
	const measureNow = sampleStats(args.measureNowPerKeystroke);
	const flushes = sampleStats(args.flushesPerFrame);
	return {
		readPhaseP95Ms: read.p95,
		writePhaseP95Ms: write.p95,
		measureNowPerKeystrokeP95: measureNow.p95,
		measureNowPerKeystrokeMax: measureNow.max,
		flushesPerFrameMax: flushes.max,
		flushesPerFrameP95: flushes.p95,
		flushCount: args.flushCount,
		keystrokeCount: args.keystrokeCount,
	};
}
