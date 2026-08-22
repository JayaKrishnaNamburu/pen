/**
 * GATE 1.11 recorded-trace authority replay. A compare that only
 * replays live-vs-live (or insert-only) cannot fail the copy-split
 * stay-on-source case the validation measured.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	AUTHORITY_TRACE_SCRIPT,
	algebraHolds,
	applyAlgebraLandings,
	authorityCompareKind,
	cloneAuthorityTrace,
	compareAuthorityTraces,
	describeAuthorityTracePopulation,
	formatAuthorityCompareReport,
	insertOnlyAuthorityScript,
	inventoryHolds,
	loadCommittedAuthorityTrace,
	noopAuthorityTrace,
	recordAuthorityTraces,
} from "../../harness/src/authorityCompare.ts";

function pointOf(record) {
	const state = record.state;
	if (state == null || state.type !== "text") {
		return "none";
	}
	return `${state.anchor.blockId}:${state.anchor.offset}`;
}

test("authorityCompare corpus is split/merge/remove, not insert-only", () => {
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
			def.commit.some(
				(op) =>
					op.type === "split-block" ||
					op.type === "merge-blocks" ||
					op.type === "delete-block",
			),
		),
		"every script case must commit a structural op",
	);

	const inventory = inventoryHolds(committed);
	assert.equal(inventory.outcome, "matched", inventory.reason);
	assert.equal(inventoryHolds(live).outcome, "could-not-check");
	assert.match(inventoryHolds(live).reason ?? "", /split-point/);
});

test("authorityCompare inventory rejects a kind-labeled insert-only corpus", () => {
	const labeled = recordAuthorityTraces(insertOnlyAuthorityScript());
	console.log(
		`insert-only script → ${labeled.cases.length} cases kinds=${labeled.cases.map((entry) => entry.kind).join(",")} commits=${labeled.cases.map((entry) => entry.commit.map((op) => op.type).join("+")).join(",")}`,
	);
	const check = inventoryHolds(labeled);
	assert.equal(check.outcome, "could-not-check");
	assert.equal(check.kind, "incomplete-corpus");
	assert.match(check.reason ?? "", /no split-block commit/);
	assert.equal(check.ok, false);
	assert.equal(check.skipped, true);
});

test("authorityCompare committed recording is the mapPoint algebra oracle", () => {
	const committed = loadCommittedAuthorityTrace();
	const algebra = algebraHolds(committed);
	assert.equal(algebra.outcome, "matched", algebra.reason);
	assert.equal(algebra.ok, true);
});

test("authorityCompare live copy-split still diverges from the algebra oracle", () => {
	const live = recordAuthorityTraces();
	const algebra = algebraHolds(live);
	console.log(
		`algebra vs live → ${algebra.outcome}${algebra.reason ? ` — ${algebra.reason}` : ""}`,
	);
	for (const entry of live.cases) {
		console.log(`  live ${entry.id}: ${pointOf(entry.before)} → ${pointOf(entry.after)}`);
	}
	assert.equal(algebra.outcome, "mismatch", algebra.reason);
	assert.equal(algebra.ok, false);
	assert.match(algebra.reason ?? "", /split-point|split-tail/);
});

test("authorityCompare three outcomes: matched, mismatch, could-not-check", () => {
	const committed = loadCommittedAuthorityTrace();
	const live = recordAuthorityTraces();
	const retargeted = applyAlgebraLandings(live);
	const noop = noopAuthorityTrace(cloneAuthorityTrace(committed));

	const matched = compareAuthorityTraces(committed, retargeted);
	assert.equal(authorityCompareKind(matched), "matched");
	assert.equal(matched.ok, true);
	assert.equal(matched.skipped, undefined);
	assert.match(formatAuthorityCompareReport("replay", matched), /^passed:/);

	const mismatch = compareAuthorityTraces(committed, live);
	assert.equal(authorityCompareKind(mismatch), "mismatch");
	assert.equal(mismatch.ok, false);
	assert.equal(mismatch.skipped, undefined);
	assert.match(mismatch.reason ?? "", /split-point|split-tail|merge-/);
	assert.match(formatAuthorityCompareReport("replay", mismatch), /^failed:/);

	const selfReplay = compareAuthorityTraces(committed, committed);
	assert.equal(authorityCompareKind(selfReplay), "could-not-check");
	assert.equal(selfReplay.ok, false);
	assert.equal(selfReplay.skipped, true);
	assert.equal(selfReplay.kind, "self-replay");
	assert.match(formatAuthorityCompareReport("replay", selfReplay), /^skipped:/);

	const missing = compareAuthorityTraces(null, live);
	assert.equal(missing.outcome, "could-not-check");
	assert.equal(missing.kind, "missing");

	const stale = cloneAuthorityTrace(committed);
	stale.scriptHash = "not-the-script";
	const staleCheck = compareAuthorityTraces(stale, live);
	assert.equal(staleCheck.outcome, "could-not-check");
	assert.equal(staleCheck.kind, "stale-recording");

	const noopCheck = compareAuthorityTraces(committed, noop);
	assert.equal(noopCheck.outcome, "mismatch");
	assert.match(formatAuthorityCompareReport("replay", noopCheck), /^failed:/);
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
		outcome: "could-not-check",
		kind: "missing",
		reason: "recording is not available",
	});
	assert.equal(passed, "passed: replay");
	assert.doesNotMatch(passed, /failed|skipped/);
	assert.equal(failed, "failed: replay — split-tail stayed on source");
	assert.doesNotMatch(failed, /passed/);
	assert.equal(skipped, "skipped: replay — recording is not available");
	assert.doesNotMatch(skipped, /passed/);
});
