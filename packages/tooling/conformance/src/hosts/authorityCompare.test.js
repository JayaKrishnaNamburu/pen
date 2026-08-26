/**
 * GATE 1.11 recorded-trace authority replay. A compare that only
 * replays live-vs-live (or insert-only) cannot fail the copy-split
 * stay-on-source case the validation measured.
 *
 * Standing DOM↔authority is three-way: matched / mismatch / unchecked.
 * Only matched is a hold. Unchecked (unfocused, non-text, missing
 * recording, self-replay) is never counted as success.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	AUTHORITY_TRACE_SCRIPT,
	AUTHORITY_TRACE_SCRIPT_HASH,
	algebraHolds,
	authorityCompareKind,
	authorityTraceHolds,
	cloneAuthorityTrace,
	commitIsStructuralSequence,
	compareAuthorityTraces,
	describeAuthorityTracePopulation,
	formatAuthorityCompareReport,
	insertOnlyAuthorityScript,
	inventoryHolds,
	loadCommittedAuthorityTrace,
	recordAuthorityTraces,
	stayOnSourceAuthorityTrace,
	noopAuthorityTrace,
} from "../authorityTrace.ts";
import {
	aggregateAuthorityChecks,
	liftDomAuthorityCheck,
	observeDomAuthority,
	replayDomAuthorityObservation,
	replayDomAuthorityTrace,
} from "../authorityCompare.ts";
import {
	authorityCheckKind,
	standingAuthorityHolds,
} from "../standingFilter.js";
import { resolveDomAuthorityCheck } from "../../harness/src/domAuthorityCompare.ts";

function pointOf(record) {
	const state = record.state;
	if (state == null || state.type !== "text") {
		return "none";
	}
	return `${state.anchor.blockId}:${state.anchor.offset}`;
}

const TEXT_AUTHORITY = {
	type: "text",
	anchor: { blockId: "b1", offset: 3 },
	focus: { blockId: "b1", offset: 3 },
	isCollapsed: true,
};

const TEXT_MAPPED = {
	anchor: { blockId: "b1", offset: 3 },
	focus: { blockId: "b1", offset: 3 },
};

test("authorityCompare corpus is split/merge/remove, not insert-only", () => {
	const harnessSource = readFileSync(
		fileURLToPath(new URL("../../harness/src/authorityCompare.ts", import.meta.url)),
		"utf8",
	);
	assert.match(harnessSource, /from ["']\.\.\/\.\.\/src\/authorityTrace["']/);
	assert.doesNotMatch(harnessSource, /export const AUTHORITY_TRACE_SCRIPT\b/);
	assert.doesNotMatch(harnessSource, /meadow sage/);
	assert.equal(AUTHORITY_TRACE_SCRIPT_HASH, JSON.stringify(AUTHORITY_TRACE_SCRIPT));

	const committed = loadCommittedAuthorityTrace();
	const live = recordAuthorityTraces();
	console.log(describeAuthorityTracePopulation(committed));
	console.log(`AUTHORITY_TRACE_SCRIPT → ${AUTHORITY_TRACE_SCRIPT.length} defs`);
	for (const def of AUTHORITY_TRACE_SCRIPT) {
		console.log(
			`  ${def.id} kind=${def.kind} region=${def.region} commit=${def.commit.map((op) => op.type).join(",")}`,
		);
	}

	assert.equal(AUTHORITY_TRACE_SCRIPT.length, 7);
	assert.equal(
		AUTHORITY_TRACE_SCRIPT.filter((def) => def.kind === "split").length,
		3,
	);
	assert.equal(
		AUTHORITY_TRACE_SCRIPT.filter((def) => def.kind === "merge").length,
		2,
	);
	assert.equal(
		AUTHORITY_TRACE_SCRIPT.filter((def) => def.kind === "remove").length,
		2,
	);
	assert.ok(
		AUTHORITY_TRACE_SCRIPT.every((def) =>
			commitIsStructuralSequence(def.kind, def.commit, def.setup),
		),
		"every script case must commit a structural sequence",
	);

	const inventory = inventoryHolds(committed);
	assert.equal(inventory.outcome, "matched", inventory.reason);
	assert.equal(authorityTraceHolds(inventory), true);
	const liveInventory = inventoryHolds(live);
	assert.equal(liveInventory.outcome, "matched", liveInventory.reason);
});

test("authorityCompare inventory rejects a kind-labeled insert-only corpus", () => {
	const labeled = recordAuthorityTraces(insertOnlyAuthorityScript());
	console.log(
		`insert-only script → ${labeled.cases.length} cases kinds=${labeled.cases.map((entry) => entry.kind).join(",")} commits=${labeled.cases.map((entry) => entry.commit.map((op) => op.type).join("+")).join(",")}`,
	);
	const check = inventoryHolds(labeled);
	assert.equal(check.outcome, "unchecked");
	assert.equal(check.kind, "incomplete-corpus");
	assert.match(check.reason ?? "", /no insert-block\+splice-text commit/);
	assert.equal(check.ok, false);
	assert.equal(check.skipped, true);
	assert.equal(authorityTraceHolds(check), false);
});

test("authorityCompare committed recording is the mapPoint algebra oracle", () => {
	const committed = loadCommittedAuthorityTrace();
	const algebra = algebraHolds(committed);
	assert.equal(algebra.outcome, "matched", algebra.reason);
	assert.equal(algebra.ok, true);
	assert.equal(authorityTraceHolds(algebra), true);
});

test("authorityCompare live copy-split lands on the destination block", () => {
	const live = recordAuthorityTraces();
	const algebra = algebraHolds(live);
	console.log(
		`algebra vs live → ${algebra.outcome}${algebra.reason ? ` — ${algebra.reason}` : ""}`,
	);
	for (const entry of live.cases) {
		console.log(`  live ${entry.id}: ${pointOf(entry.before)} → ${pointOf(entry.after)}`);
	}
	assert.equal(algebra.outcome, "matched", algebra.reason);
	assert.equal(algebra.ok, true);

	const byId = new Map(live.cases.map((entry) => [entry.id, entry]));
	assert.equal(pointOf(byId.get("split-point")?.after), "b2:0");
	assert.equal(pointOf(byId.get("split-tail")?.after), "b2:3");
});

test("authorityCompare three outcomes: matched, mismatch, unchecked", () => {
	const committed = loadCommittedAuthorityTrace();
	const live = recordAuthorityTraces();
	const noop = noopAuthorityTrace(cloneAuthorityTrace(committed));

	const matched = compareAuthorityTraces(committed, live);
	assert.equal(authorityCompareKind(matched), "matched");
	assert.equal(matched.ok, true);
	assert.equal(matched.skipped, undefined);
	assert.equal(authorityTraceHolds(matched), true);
	assert.match(formatAuthorityCompareReport("replay", matched), /^passed:/);

	const mismatch = compareAuthorityTraces(committed, noop);
	assert.equal(authorityCompareKind(mismatch), "mismatch");
	assert.equal(mismatch.ok, false);
	assert.equal(mismatch.skipped, undefined);
	assert.equal(authorityTraceHolds(mismatch), false);
	assert.match(mismatch.reason ?? "", /split-point|split-tail|merge-/);
	assert.match(formatAuthorityCompareReport("replay", mismatch), /^failed:/);

	const selfReplay = compareAuthorityTraces(committed, committed);
	assert.equal(authorityCompareKind(selfReplay), "unchecked");
	assert.equal(selfReplay.ok, false);
	assert.equal(selfReplay.skipped, true);
	assert.equal(selfReplay.kind, "self-replay");
	assert.equal(authorityTraceHolds(selfReplay), false);
	assert.match(formatAuthorityCompareReport("replay", selfReplay), /^skipped:/);

	const missing = compareAuthorityTraces(null, live);
	assert.equal(missing.outcome, "unchecked");
	assert.equal(missing.kind, "missing");
	assert.equal(authorityTraceHolds(missing), false);

	const stale = cloneAuthorityTrace(committed);
	stale.scriptHash = "not-the-script";
	const staleCheck = compareAuthorityTraces(stale, live);
	assert.equal(staleCheck.outcome, "unchecked");
	assert.equal(staleCheck.kind, "stale-recording");
	assert.equal(authorityTraceHolds(staleCheck), false);
});

test("authorityCompare live copy-split that stays on the source is a named mismatch", () => {
	const committed = loadCommittedAuthorityTrace();
	assert.ok(committed, "committed recording must be present");
	const stalled = stayOnSourceAuthorityTrace(cloneAuthorityTrace(committed));
	const check = compareAuthorityTraces(committed, stalled);
	console.log(
		`stay-on-source → ${check.outcome} ${check.caseId ?? ""} ${check.reason ?? ""}`,
	);
	assert.equal(authorityCompareKind(check), "mismatch");
	assert.equal(check.ok, false);
	assert.equal(authorityTraceHolds(check), false);
	assert.match(check.reason ?? "", /split-point|split-tail/);
	assert.match(check.caseId ?? "", /split-point|split-tail/);
	assert.match(
		formatAuthorityCompareReport("replay", check),
		/^failed: replay — split-(point|tail)/,
	);

	const algebra = algebraHolds(stalled);
	assert.equal(algebra.outcome, "mismatch");
	assert.match(algebra.reason ?? "", /split-point|split-tail/);
});

test("authorityCompare unfocused observation is unchecked, not a hold", () => {
	const input = {
		id: "unfocused-caret",
		hasRoot: true,
		hasFocus: false,
		authority: TEXT_AUTHORITY,
		mapped: TEXT_MAPPED,
	};
	const observed = observeDomAuthority(input);
	const harness = resolveDomAuthorityCheck(input);
	const replayed = replayDomAuthorityObservation(input);
	const lifted = liftDomAuthorityCheck(observed, input.id);

	assert.equal(observed.ok, false);
	assert.equal(observed.skipped, true);
	assert.equal(observed.reason, "editor is unfocused");
	assert.deepEqual(observed, harness);
	assert.equal(authorityCheckKind(observed), "unchecked");
	assert.equal(standingAuthorityHolds(observed), false);
	assert.equal(authorityCompareKind(replayed), "unchecked");
	assert.equal(replayed.kind, "unfocused");
	assert.equal(replayed.ok, false);
	assert.equal(replayed.skipped, true);
	assert.equal(authorityTraceHolds(replayed), false);
	assert.equal(authorityTraceHolds(lifted), false);
	assert.match(formatAuthorityCompareReport("replay", replayed), /^skipped:/);
	assert.doesNotMatch(formatAuthorityCompareReport("replay", replayed), /passed/);
});

test("authorityCompare non-text observation is unchecked, not a hold", () => {
	const input = {
		id: "block-selection",
		hasRoot: true,
		hasFocus: true,
		authority: { type: "block", blockIds: ["b1"] },
		mapped: null,
	};
	const observed = observeDomAuthority(input);
	const harness = resolveDomAuthorityCheck(input);
	const replayed = replayDomAuthorityObservation(input);

	assert.equal(observed.ok, false);
	assert.equal(observed.skipped, true);
	assert.equal(observed.reason, "authority is not a text selection");
	assert.deepEqual(observed, harness);
	assert.equal(authorityCheckKind(observed), "unchecked");
	assert.equal(standingAuthorityHolds(observed), false);
	assert.equal(authorityCompareKind(replayed), "unchecked");
	assert.equal(replayed.kind, "non-text");
	assert.equal(authorityTraceHolds(replayed), false);
	assert.match(formatAuthorityCompareReport("replay", replayed), /^skipped:/);
});

test("authorityCompare aggregation does not count unchecked as a hold", () => {
	const matched = replayDomAuthorityObservation({
		id: "focused-text",
		hasRoot: true,
		hasFocus: true,
		authority: TEXT_AUTHORITY,
		mapped: TEXT_MAPPED,
	});
	const unfocused = replayDomAuthorityObservation({
		id: "unfocused-caret",
		hasRoot: true,
		hasFocus: false,
		authority: TEXT_AUTHORITY,
		mapped: TEXT_MAPPED,
	});
	const diverged = replayDomAuthorityObservation({
		id: "stale-projection",
		hasRoot: true,
		hasFocus: true,
		authority: TEXT_AUTHORITY,
		mapped: {
			anchor: { blockId: "b1", offset: 0 },
			focus: { blockId: "b1", offset: 0 },
		},
	});

	assert.equal(matched.outcome, "matched");
	assert.equal(authorityTraceHolds(matched), true);

	const mixed = replayDomAuthorityTrace([
		{
			id: "focused-text",
			hasRoot: true,
			hasFocus: true,
			authority: TEXT_AUTHORITY,
			mapped: TEXT_MAPPED,
		},
		{
			id: "unfocused-caret",
			hasRoot: true,
			hasFocus: false,
			authority: TEXT_AUTHORITY,
			mapped: TEXT_MAPPED,
		},
	]);
	assert.equal(mixed.outcome, "unchecked");
	assert.equal(authorityTraceHolds(mixed), false);
	assert.match(formatAuthorityCompareReport("standing", mixed), /^skipped:/);

	const empty = aggregateAuthorityChecks([]);
	assert.equal(empty.outcome, "unchecked");
	assert.equal(authorityTraceHolds(empty), false);

	const allMatched = aggregateAuthorityChecks([matched, matched]);
	assert.equal(allMatched.outcome, "matched");
	assert.equal(authorityTraceHolds(allMatched), true);

	const mismatchWins = aggregateAuthorityChecks([matched, unfocused, diverged]);
	assert.equal(mismatchWins.outcome, "mismatch");
	assert.equal(authorityTraceHolds(mismatchWins), false);
	assert.match(formatAuthorityCompareReport("standing", mismatchWins), /^failed:/);
});

test("authorityCompare unfocused-shaped skip is not a match", () => {
	const passed = formatAuthorityCompareReport("replay", {
		ok: true,
		outcome: "matched",
	});
	const failed = formatAuthorityCompareReport("replay", {
		ok: false,
		outcome: "mismatch",
		reason: "split-tail stayed on source",
	});
	const skipped = formatAuthorityCompareReport("replay", {
		ok: false,
		skipped: true,
		outcome: "unchecked",
		kind: "unfocused",
		reason: "editor is unfocused",
	});
	assert.equal(passed, "passed: replay");
	assert.doesNotMatch(passed, /failed|skipped/);
	assert.equal(failed, "failed: replay — split-tail stayed on source");
	assert.doesNotMatch(failed, /passed/);
	assert.equal(skipped, "skipped: replay — editor is unfocused");
	assert.doesNotMatch(skipped, /passed/);
});
