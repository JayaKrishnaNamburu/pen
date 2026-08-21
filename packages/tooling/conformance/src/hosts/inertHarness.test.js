/**
 * Node-importable lock for helpers that Playwright used to own alone.
 * A helper that can quietly do nothing is how standing checks and
 * windowing stay green while every scenario is weaker.
 *
 * Playwright-only remainder (mutation procedure, not executed here):
 * - analyzeEditorSurface / analyzeEditorWcag22Aa: in
 *   scenarios/ax1-surface-semantics.spec.ts and src/scenario.ts standing
 *   axe, replace the call with `{ violations: [] }` and the axe specs
 *   stay green. formatAxeViolations / axeAnalyzeTags are locked below.
 * - checkDomMatchesAuthority DOM read (editorRoot, focus, domSelectionToEditor):
 *   in harness-self-test.spec.ts, skip installBrokenProjector; the
 *   self-test must stop rejecting. compareMappedToAuthority is locked
 *   below.
 * - geometry ensureGeometry / compareCaretCache / flushEightRemoteCarets /
 *   runVerticalMotion: in harness-self-test geometry scenario, make
 *   compare return staleCount: 0 / paintedCount: 0 always. The spec
 *   asserts those fields.
 * - App render / WindowedContent click: in scale5-virtualization.spec.ts,
 *   force isWindowedFixture to false (mount all 40). SCALE5 asserts the
 *   window size attribute.
 * - session loadFixture / remoteSplice / installBridge / injectPresence:
 *   no-op load() and every s.load scenario stays on hello-world. Not
 *   imported by this Node suite.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	AXE_INCLUDE,
	AXE_SURFACE_TAGS,
	AXE_WCAG22_AA_TAGS,
	axeAnalyzeTags,
	formatAxeViolations,
} from "../axeFormat.js";
import {
	authorityCheckKind,
	isStandingCode,
	standingAuthorityHolds,
	unexpectedStandingDiagnostics,
} from "../standingFilter.js";
import {
	clampWindowStart,
	isWindowedFixture,
	visibleWindowedBlockIds,
	WINDOWED_FIXTURE_NAME,
} from "../windowedRange.ts";
import {
	compareMappedToAuthority,
	misplacedOffset,
	pointsEqual,
	resolveDomAuthorityCheck,
} from "../../harness/src/domAuthorityCompare.ts";
import {
	graphemeWalkHolds,
	graphemeBoundaryOffsets,
} from "../graphemeBoundaries.ts";
import {
	caretShiftHolds,
	monotonicHolds,
	originHolds,
	recordPresence,
} from "../selectionRecordCheck.ts";
import {
	caretCacheHolds,
	geometryBlocksFromEditor,
	normalizePoint,
	rectsEqual,
	serializeRect,
	tallyCaretCompares,
} from "../../harness/src/geometryCompare.ts";
import {
	GRAPHEME_ZWJ_AFTER,
	GRAPHEME_ZWJ_LINE,
} from "../../fixtures/grapheme.ts";

function readRel(rel) {
	return readFileSync(new URL(rel, import.meta.url), "utf8");
}

test("unexpectedStandingDiagnostics drops noise and keeps a standing code", () => {
	const unexpected = unexpectedStandingDiagnostics(
		[
			{ code: "import-dropped", level: "warning", source: "t", message: "x" },
			{ code: "dom-divergence", level: "error", source: "t", message: "x" },
			{
				code: "selection-projection-mismatch",
				level: "error",
				source: "t",
				message: "x",
			},
		],
		new Set(["selection-projection-mismatch"]),
	);
	assert.deepEqual(
		unexpected.map((event) => event.code),
		["dom-divergence"],
	);
	assert.deepEqual(unexpectedStandingDiagnostics([], new Set()), []);
	assert.equal(isStandingCode("dom-divergence"), true);
	assert.equal(isStandingCode("import-dropped"), false);
});

test("standingAuthorityHolds is false when the compare was skipped", () => {
	assert.equal(authorityCheckKind({ ok: true }), "matched");
	assert.equal(standingAuthorityHolds({ ok: true }), true);
	assert.equal(
		authorityCheckKind({ ok: false, skipped: true, reason: "editor is unfocused" }),
		"unchecked",
	);
	assert.equal(
		standingAuthorityHolds({
			ok: false,
			skipped: true,
			reason: "editor is unfocused",
		}),
		false,
	);
	assert.equal(
		standingAuthorityHolds({ ok: true, skipped: true }),
		false,
	);
	assert.equal(authorityCheckKind({ ok: false, reason: "x" }), "mismatch");
	assert.equal(standingAuthorityHolds({ ok: false, reason: "x" }), false);
});

test("formatAxeViolations fails on a violation and passes on none", () => {
	assert.match(formatAxeViolations([]), /^passed:/);
	const failed = formatAxeViolations([
		{
			id: "aria-hidden-focus",
			impact: "serious",
			help: "hidden",
			nodes: [{ target: ["#root"], failureSummary: "focusable" }],
		},
	]);
	assert.match(failed, /^failed:/);
	assert.match(failed, /aria-hidden-focus/);
	assert.equal(AXE_INCLUDE, "[data-pen-editor-root]");
	assert.deepEqual([...axeAnalyzeTags("surface")], [...AXE_SURFACE_TAGS]);
	assert.deepEqual([...axeAnalyzeTags("wcag")], [...AXE_WCAG22_AA_TAGS]);
	assert.notDeepEqual(axeAnalyzeTags("surface"), axeAnalyzeTags("wcag"));
	assert.ok(AXE_SURFACE_TAGS.length > 0);
	assert.ok(AXE_WCAG22_AA_TAGS.length > 0);
});

test("compareMappedToAuthority fails a misplaced caret", () => {
	const authority = {
		type: "text",
		anchor: { blockId: "p1", offset: 2 },
		focus: { blockId: "p1", offset: 2 },
		isCollapsed: true,
	};
	const match = compareMappedToAuthority(authority, {
		anchor: { blockId: "p1", offset: 2 },
		focus: { blockId: "p1", offset: 2 },
	});
	assert.equal(match.ok, true);
	const miss = compareMappedToAuthority(authority, {
		anchor: { blockId: "p1", offset: 0 },
		focus: { blockId: "p1", offset: 0 },
	});
	assert.equal(miss.ok, false);
	assert.match(miss.reason, /does not match editor\.selection/);
	assert.equal(compareMappedToAuthority(null, null).ok, true);
	assert.equal(compareMappedToAuthority(null, null).skipped, undefined);
	assert.equal(
		compareMappedToAuthority(null, {
			anchor: { blockId: "p1", offset: 0 },
			focus: { blockId: "p1", offset: 0 },
		}).ok,
		false,
	);
});

test("compareMappedToAuthority does not pass a non-text authority", () => {
	const mapped = {
		anchor: { blockId: "p1", offset: 0 },
		focus: { blockId: "p1", offset: 0 },
	};
	const block = compareMappedToAuthority(
		{ type: "block", blockIds: ["p1"] },
		mapped,
	);
	assert.equal(block.skipped, true);
	assert.equal(block.ok, false);
	assert.equal(authorityCheckKind(block), "unchecked");
	assert.equal(standingAuthorityHolds(block), false);
	assert.match(block.reason ?? "", /not a text selection/);
});

test("resolveDomAuthorityCheck does not pass an unfocused editor", () => {
	const authority = {
		type: "text",
		anchor: { blockId: "p1", offset: 2 },
		focus: { blockId: "p1", offset: 2 },
		isCollapsed: true,
	};
	const mapped = {
		anchor: { blockId: "p1", offset: 2 },
		focus: { blockId: "p1", offset: 2 },
	};
	const skipped = resolveDomAuthorityCheck({
		hasRoot: true,
		hasFocus: false,
		authority,
		mapped,
	});
	assert.equal(skipped.skipped, true);
	assert.equal(skipped.ok, false);
	assert.equal(authorityCheckKind(skipped), "unchecked");
	assert.equal(standingAuthorityHolds(skipped), false);
	assert.match(skipped.reason ?? "", /unfocused/);

	const matched = resolveDomAuthorityCheck({
		hasRoot: true,
		hasFocus: true,
		authority,
		mapped,
	});
	assert.equal(matched.skipped, undefined);
	assert.equal(matched.ok, true);
	assert.equal(authorityCheckKind(matched), "matched");
	assert.equal(standingAuthorityHolds(matched), true);

	const missingRoot = resolveDomAuthorityCheck({
		hasRoot: false,
		hasFocus: false,
		authority,
		mapped: null,
	});
	assert.equal(missingRoot.skipped, undefined);
	assert.equal(missingRoot.ok, false);
	assert.equal(authorityCheckKind(missingRoot), "mismatch");
});

test("misplacedOffset never returns the live offset when it can move", () => {
	assert.notEqual(misplacedOffset(0, 4), 0);
	assert.notEqual(misplacedOffset(2, 4), 2);
	assert.equal(pointsEqual({ blockId: "a", offset: 1 }, { blockId: "a", offset: 1 }), true);
	assert.equal(pointsEqual({ blockId: "a", offset: 1 }, { blockId: "b", offset: 1 }), false);
});

test("geometry serialize/rectsEqual/normalizePoint move when inputs move", () => {
	assert.equal(serializeRect(null), null);
	const rect = {
		x: 1,
		y: 2,
		width: 3,
		height: 4,
		top: 2,
		left: 1,
		right: 4,
		bottom: 6,
	};
	assert.deepEqual(serializeRect(rect), rect);
	assert.equal(rectsEqual(rect, { ...rect }), true);
	assert.equal(rectsEqual(rect, { ...rect, x: 9 }), false);
	assert.equal(rectsEqual(null, null), true);
	assert.equal(rectsEqual(rect, null), false);
	assert.deepEqual(normalizePoint({ blockId: "p1", offset: 3 }), {
		point: { blockId: "p1", offset: 3 },
		affinity: "downstream",
	});
	assert.deepEqual(
		normalizePoint({ blockId: "p1", offset: 3, affinity: "upstream" }),
		{ point: { blockId: "p1", offset: 3 }, affinity: "upstream" },
	);
	assert.deepEqual(
		geometryBlocksFromEditor({
			documentState: { blockOrder: ["a"] },
			getBlock: () => ({ length: () => 4 }),
		}),
		[{ id: "a", length: 4 }],
	);
});

test("caretCacheHolds fails a both-null caretRect even when staleCount is 0", () => {
	const bothNull = tallyCaretCompares([
		{
			point: { blockId: "p1", offset: 0 },
			affinity: "downstream",
			cached: null,
			fromScratch: null,
			stale: !rectsEqual(null, null),
		},
	]);
	assert.equal(bothNull.staleCount, 0);
	assert.equal(bothNull.missingCount, 1);
	assert.equal(caretCacheHolds(bothNull), false);

	const rect = {
		x: 1,
		y: 2,
		width: 3,
		height: 4,
		top: 2,
		left: 1,
		right: 4,
		bottom: 6,
	};
	const live = tallyCaretCompares([
		{
			point: { blockId: "p1", offset: 0 },
			affinity: "downstream",
			cached: rect,
			fromScratch: rect,
			stale: !rectsEqual(rect, rect),
		},
	]);
	assert.equal(live.staleCount, 0);
	assert.equal(live.missingCount, 0);
	assert.equal(caretCacheHolds(live), true);

	const stale = tallyCaretCompares([
		{
			point: { blockId: "p1", offset: 0 },
			affinity: "downstream",
			cached: rect,
			fromScratch: { ...rect, x: 9 },
			stale: !rectsEqual(rect, { ...rect, x: 9 }),
		},
	]);
	assert.equal(stale.staleCount, 1);
	assert.equal(caretCacheHolds(stale), false);
});

test("windowed range is a real slice, not identity or empty", () => {
	const ids = Array.from({ length: 40 }, (_, index) => `win-${index}`);
	assert.equal(isWindowedFixture(WINDOWED_FIXTURE_NAME), true);
	assert.equal(isWindowedFixture("hello-world"), false);
	const visible = visibleWindowedBlockIds(ids, 0, 8);
	assert.deepEqual(visible, ids.slice(0, 8));
	assert.equal(visible.length, 8);
	assert.notEqual(visible.length, ids.length);
	assert.deepEqual(visibleWindowedBlockIds(ids, 32, 8), ids.slice(32, 40));
	assert.deepEqual(visibleWindowedBlockIds(ids, 0, 0), []);
	assert.equal(clampWindowStart(-4, 40, 8), 0);
	assert.equal(clampWindowStart(100, 40, 8), 32);
	assert.equal(clampWindowStart(4.9, 40, 8), 4);
});

test("Playwright-only helpers stay imported by a named scenario", () => {
	const selfTest = readRel("../../scenarios/harness-self-test.spec.ts");
	assert.match(selfTest, /installBrokenProjector/);
	assert.match(selfTest, /flushEightRemoteCarets/);
	assert.match(selfTest, /compareCaretCache|s\.geometry\.compare/);
	const scenario = readRel("../scenario.ts");
	assert.match(scenario, /analyzeEditorWcag22Aa/);
	assert.match(scenario, /assertStandingDomMatchesAuthority/);
	assert.match(scenario, /assertStandingDiagnostics/);
	assert.doesNotMatch(scenario, /violations:\s*\[\s*\]/);
	const ax1 = readRel("../../scenarios/ax1-surface-semantics.spec.ts");
	assert.match(ax1, /analyzeEditorSurface/);
	const scale5 = readRel("../../scenarios/scale5-virtualization.spec.ts");
	assert.match(scale5, /WINDOWED_WINDOW_SIZE/);
	const app = readRel("../../harness/src/App.tsx");
	assert.match(app, /isWindowedFixture/);
	const windowed = readRel("../../harness/src/windowedContent.tsx");
	assert.match(windowed, /visibleWindowedBlockIds/);
	const session = readRel("../../harness/src/session.ts");
	assert.match(session, /resolveDomAuthorityCheck/);
	assert.match(session, /clampWindowStart/);
	assert.match(session, /from "\.\/domAuthorityCompare"/);
	assert.doesNotMatch(session, /from "\.\/authorityCompare"/);
	assert.match(session, /getEditorSelectionRecord/);
	assert.match(session, /selectionRecord/);
	assert.match(session, /selectionIsCollapsed/);
	const geometry = readRel("../../harness/src/geometry.ts");
	assert.match(geometry, /from "\.\/geometryCompare"/);
	assert.match(geometry, /geometryBlocksFromEditor/);
	assert.match(geometry, /tallyCaretCompares/);
});

test("authorityCompare filename is free for Wave 1 trace replay", () => {
	const harnessDir = fileURLToPath(new URL("../../harness/src/", import.meta.url));
	const oldName = `${harnessDir}authorityCompare.ts`;
	const newName = `${harnessDir}domAuthorityCompare.ts`;
	console.log(`harness/src/authorityCompare.ts → ${existsSync(oldName) ? 1 : 0} files`);
	console.log(`harness/src/domAuthorityCompare.ts → ${existsSync(newName) ? 1 : 0} files`);
	assert.equal(existsSync(oldName), false);
	assert.equal(existsSync(newName), true);
});

test("caretShiftHolds distinguishes missing, identity, wrong landing, and match", () => {
	const textRecord = (offset) => ({
		version: 1,
		origin: "programmatic",
		commitId: 0,
		state: {
			type: "text",
			anchor: { blockId: "p1", offset },
			focus: { blockId: "p1", offset },
			isCollapsed: true,
		},
	});
	const missing = caretShiftHolds(null, textRecord(6), 6);
	assert.equal(missing.ok, false);
	assert.equal(missing.skipped, true);
	const identity = caretShiftHolds(textRecord(5), textRecord(5), 6);
	assert.equal(identity.ok, false);
	assert.equal(identity.skipped, true);
	assert.match(identity.reason ?? "", /stayed at 5/);
	const wrong = caretShiftHolds(textRecord(5), textRecord(7), 6);
	assert.equal(wrong.ok, false);
	assert.equal(wrong.skipped, undefined);
	assert.match(wrong.reason ?? "", /5 → 7/);
	const hit = caretShiftHolds(textRecord(5), textRecord(6), 6);
	assert.equal(hit.ok, true);
	assert.equal(hit.skipped, undefined);
});

test("originHolds distinguishes missing, mismatch, and match", () => {
	assert.equal(recordPresence(null), "missing");
	const missing = originHolds(null, "mapped");
	assert.equal(missing.ok, false);
	assert.equal(missing.skipped, true);
	const miss = originHolds(
		{ version: 1, origin: "programmatic", commitId: 0, state: null },
		"mapped",
	);
	assert.equal(miss.ok, false);
	assert.equal(miss.skipped, undefined);
	const hit = originHolds(
		{ version: 2, origin: "mapped", commitId: 3, state: null },
		"mapped",
	);
	assert.equal(hit.ok, true);
});

test("monotonicHolds fails a decrease and skips a no-op walk", () => {
	const decreased = monotonicHolds([
		{ version: 4, commitId: 2 },
		{ version: 3, commitId: 2 },
	]);
	assert.equal(decreased.ok, false);
	assert.equal(decreased.skipped, undefined);
	assert.match(decreased.reason ?? "", /version decreased/);

	const commitDrop = monotonicHolds([
		{ version: 4, commitId: 5 },
		{ version: 4, commitId: 4 },
	]);
	assert.equal(commitDrop.ok, false);
	assert.match(commitDrop.reason ?? "", /commitId decreased/);

	const noop = monotonicHolds([
		{ version: 1, commitId: 0 },
		{ version: 1, commitId: 0 },
	]);
	assert.equal(noop.ok, false);
	assert.equal(noop.skipped, true);

	const rising = monotonicHolds([
		{ version: 1, commitId: 0 },
		{ version: 2, commitId: 1 },
	]);
	assert.equal(rising.ok, true);
});

test("graphemeWalkHolds fails an interior offset and skips a no-op walk", () => {
	const boundaries = graphemeBoundaryOffsets(GRAPHEME_ZWJ_LINE);
	assert.ok(boundaries.includes(0));
	assert.ok(boundaries.includes(GRAPHEME_ZWJ_AFTER));
	assert.ok(boundaries.length < GRAPHEME_ZWJ_LINE.length + 1);

	const interior = graphemeWalkHolds({
		text: GRAPHEME_ZWJ_LINE,
		offsets: [0, 1, 2],
		mustVisit: GRAPHEME_ZWJ_AFTER,
	});
	assert.equal(interior.ok, false);
	assert.equal(interior.skipped, undefined);
	assert.match(interior.reason ?? "", /inside a grapheme/);

	const idle = graphemeWalkHolds({
		text: GRAPHEME_ZWJ_LINE,
		offsets: [0],
		mustVisit: GRAPHEME_ZWJ_AFTER,
	});
	assert.equal(idle.ok, false);
	assert.equal(idle.skipped, undefined);
	assert.match(idle.reason ?? "", /never reached/);

	const walk = graphemeWalkHolds({
		text: GRAPHEME_ZWJ_LINE,
		offsets: boundaries,
		mustVisit: GRAPHEME_ZWJ_AFTER,
	});
	assert.equal(walk.ok, true);
});
