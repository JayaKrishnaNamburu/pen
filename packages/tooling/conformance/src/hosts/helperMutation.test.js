/**
 * Load-bearing lock for exported helpers. A helper that can quietly do
 * nothing is how two-peer collaboration and ASSERT_DOC_EQUALS_FIELDS
 * shipped green in the sibling test package. Each case would fail if
 * the named helper returned empty / identity / always-ok.
 *
 * No-op'd against this node suite and stayed green: `scenario`,
 * `getInlineOffsetPoint` / `resolveBlockId`, `runPropertySuite`, and
 * the rest of the Playwright/DOM surface (`standingAssertions`,
 * `axeSurface` analyzers, `harness/src/geometry.ts`, `session.ts`
 * besides `connectPeers` / `serialize*`). Those are load-bearing only
 * when Playwright runs.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Y from "yjs";
import { connectPeers } from "../connectPeers.ts";
import {
	formatCheckReport,
	formatDiagnosticsReport,
	formatDomAuthorityReport,
} from "../checkReport.js";
import { parseNumericFuzzSeed } from "../fuzz/run-properties.mjs";
import { discoverPublishedExportPaths } from "./discover.js";
import {
	classifyDrift,
	formatDriftReport,
	formatMetricLine,
	nearestRankPercentile,
	sampleStats,
	signedDelta,
	summarizeTypingBudget,
	compareTypingBudgets,
} from "../typingBudget.js";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

test("connectPeers: peer B receives peer A's insert", () => {
	const local = new Y.Doc({ gc: false });
	const remote = new Y.Doc({ gc: false });
	Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
	const disconnect = connectPeers(local, remote);
	local.getArray("blockOrder").push(["from-a"]);
	assert.deepEqual(remote.getArray("blockOrder").toArray(), ["from-a"]);
	disconnect();
});

test("connectPeers no-op would drop the insert", () => {
	const local = new Y.Doc({ gc: false });
	const remote = new Y.Doc({ gc: false });
	Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
	const noop = () => {};
	noop();
	local.getArray("blockOrder").push(["from-a"]);
	assert.deepEqual(remote.getArray("blockOrder").toArray(), []);
});

test("serializeSelection copies the live points; null stays null", async () => {
	const { serializeSelection, serializeDiagnostic } = await import(
		"../../harness/src/serialize.ts"
	);
	assert.equal(serializeSelection(null), null);
	const text = serializeSelection({
		type: "text",
		anchor: { blockId: "p1", offset: 2 },
		focus: { blockId: "p1", offset: 4 },
		isCollapsed: false,
	});
	assert.deepEqual(text, {
		type: "text",
		anchor: { blockId: "p1", offset: 2 },
		focus: { blockId: "p1", offset: 4 },
		isCollapsed: false,
	});
	const diagnostic = serializeDiagnostic({
		code: "dom-divergence",
		level: "error",
		source: "test",
		message: "x",
		reason: "why",
	});
	assert.equal(diagnostic.code, "dom-divergence");
	assert.equal(diagnostic.reason, "why");
});

test("sampleCaretPoints samples empty and mid offsets", async () => {
	const { sampleCaretPoints } = await import("../wave3Geometry.ts");
	const empty = sampleCaretPoints([{ id: "g5-empty", length: 0 }]);
	assert.ok(empty.length > 0, "empty block produced no caret points");
	assert.ok(empty.every((point) => point.offset === 0));
	assert.ok(empty.some((point) => point.affinity === "downstream"));
	assert.ok(empty.some((point) => point.affinity === "upstream"));

	const mid = sampleCaretPoints([{ id: "wrap", length: 4 }]);
	const offsets = new Set(mid.map((point) => point.offset));
	assert.ok(offsets.has(0));
	assert.ok(offsets.has(2));
	assert.ok(offsets.has(4));
	assert.equal(sampleCaretPoints([]).length, 0);
});

test("tenK generator is 10000 words and matches the committed hash", async () => {
	const { readFileSync } = await import("node:fs");
	const { fileURLToPath } = await import("node:url");
	const {
		generateTenKParagraphs,
		tenKFixtureIdentity,
		tenKWordOps,
		tenKBlockId,
		TEN_K_WORD_COUNT,
		TEN_K_PARAGRAPH_COUNT,
	} = await import("../tenKWordFixture.ts");
	const paragraphs = generateTenKParagraphs();
	assert.equal(paragraphs.length, TEN_K_PARAGRAPH_COUNT);
	const identity = tenKFixtureIdentity(paragraphs);
	assert.equal(identity.wordCount, TEN_K_WORD_COUNT);
	assert.equal(identity.wordCount, 10_000);
	const baseline = JSON.parse(
		readFileSync(
			fileURLToPath(
				new URL("../../baselines/wave3-typing-budget.chromium.json", import.meta.url),
			),
			"utf8",
		),
	);
	assert.equal(identity.contentSha256, baseline.fixture.contentSha256);
	const independent = createHash("sha256")
		.update(paragraphs.join("\n"), "utf8")
		.digest("hex");
	assert.equal(identity.contentSha256, independent);

	const ops = tenKWordOps("hello-p1", 11);
	assert.ok(ops.some((op) => op.type === "delete-text" && op.length === 11));
	assert.ok(ops.some((op) => op.type === "insert-block"));
	assert.equal(tenKBlockId(3), "w3-10k-p03");
});

test("parseNumericFuzzSeed does not collapse a run-id string to 0", () => {
	assert.equal(parseNumericFuzzSeed(""), 20260819);
	assert.equal(parseNumericFuzzSeed(null), 20260819);
	assert.equal(parseNumericFuzzSeed("42"), 42);
	const hashed = parseNumericFuzzSeed("123-1-1700000000");
	assert.notEqual(hashed, 0);
	assert.notEqual(hashed, 20260819);
	assert.equal(hashed, parseNumericFuzzSeed("123-1-1700000000"));
});

test("isFixtureName and windowedBlockId are live predicates, not always-true", async () => {
	const { readFileSync } = await import("node:fs");
	const { fileURLToPath } = await import("node:url");
	const catalog = readFileSync(
		fileURLToPath(new URL("../../fixtures/catalog.ts", import.meta.url)),
		"utf8",
	);
	assert.match(catalog, /return `win-\$\{index\}`/);
	assert.match(
		catalog,
		/hasOwnProperty\.call\(LOCAL_FIXTURES, name\)/,
	);
	assert.match(
		catalog,
		/return isLocalFixtureName\(name\) \|\| name === "deterministic"/,
	);
	assert.doesNotMatch(
		catalog,
		/export function isFixtureName[\s\S]*return true;/,
	);
});

test("discoverPublishedExportPaths finds core and skips private packages", () => {
	const entries = discoverPublishedExportPaths(repoRoot);
	assert.ok(entries.length > 0);
	const names = new Set(entries.map((entry) => entry.packageName));
	assert.ok(names.has("@input/pen-core"));
	assert.equal(names.has("@input/pen-conformance"), false);
});

test("typingBudget helpers move when inputs move", () => {
	assert.equal(nearestRankPercentile([], 95), null);
	assert.equal(nearestRankPercentile([1, 2, 3, 4], 50), 2);
	const stats = sampleStats([2, 4, 6]);
	assert.equal(stats.count, 3);
	assert.equal(stats.min, 2);
	assert.equal(stats.max, 6);
	assert.equal(stats.mean, 4);
	assert.deepEqual(signedDelta(10, 12), { abs: 2, pct: 20 });
	assert.deepEqual(signedDelta(null, 1), { abs: null, pct: null });
	assert.equal(
		classifyDrift({ kind: "count", baseline: 1, current: 2 }),
		"loud",
	);
	assert.equal(
		classifyDrift({ kind: "time", baseline: 1, current: 1.05 }),
		"quiet",
	);
	const line = formatMetricLine("flushCount", "count", 1, 2);
	assert.equal(line.level, "loud");
	assert.match(line.line, /1 → 2/);
	const summary = summarizeTypingBudget({
		readPhaseMs: [1, 2, 3],
		writePhaseMs: [0],
		measureNowPerKeystroke: [0, 0],
		flushesPerFrame: [1, 1],
		flushCount: 2,
		keystrokeCount: 2,
	});
	assert.equal(summary.keystrokeCount, 2);
	assert.equal(summary.flushCount, 2);
	assert.notEqual(summary.readPhaseP95Ms, null);
	const compared = compareTypingBudgets(
		{ summary },
		{
			summary: { ...summary, flushCount: 3 },
		},
	);
	assert.ok(compared.loud.length > 0);
	const report = formatDriftReport(
		{ summary, fixture: { contentSha256: "a" } },
		{ summary: { ...summary, flushCount: 3 }, fixture: { contentSha256: "a" } },
	);
	assert.equal(report.loud, true);
	assert.match(report.text, /record-only/);
});

test("checkReport titles stay honest under a no-op-shaped input", () => {
	assert.equal(formatCheckReport("x", "passed"), "passed: x");
	assert.doesNotMatch(formatCheckReport("x", "passed"), /failed/);
	assert.match(formatDomAuthorityReport({ ok: false, reason: "r" }), /^failed:/);
	assert.match(formatDiagnosticsReport([]), /^passed:/);
	assert.match(formatDiagnosticsReport([{ code: "dom-divergence" }]), /^failed:/);
});

test("STANDING_DIAGNOSTIC_CODES is a non-empty closed list", async () => {
	const { STANDING_DIAGNOSTIC_CODES, DIAGNOSTICS_ALLOWLIST } = await import(
		"../diagnosticsAllowlist.ts"
	);
	assert.ok(STANDING_DIAGNOSTIC_CODES.includes("dom-divergence"));
	assert.ok(STANDING_DIAGNOSTIC_CODES.includes("selection-projection-mismatch"));
	assert.ok(STANDING_DIAGNOSTIC_CODES.length > 0);
	assert.equal(DIAGNOSTICS_ALLOWLIST.length, 0);
});
