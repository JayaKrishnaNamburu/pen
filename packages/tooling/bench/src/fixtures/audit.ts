import { SCALE1_MEASUREMENTS, type EnvelopeRungId } from "../constants/scale1";

export type FixtureVerdict = "agrees" | "name-overstates" | "wrong-subject";
export type CountTrust = "trusted" | "untrusted";
export type ClockTrust = "load-taken" | "untrustworthy" | "not-a-clock";

export interface FixtureAuditRow {
	id: string;
	fixture: string;
	claimedSubject: string;
	actualSubject: string;
	verdict: FixtureVerdict;
	countTrust: CountTrust;
	clockTrust: ClockTrust;
	floorKind:
		| "empty-timer"
		| "empty-sync"
		| "yield-macrotasks"
		| "delayed-timer"
		| "unmeasurable";
	howMeasured: string;
}

/**
 * What each bench fixture actually exercises. The last two published
 * defects were a name that described work the fixture never did
 * (concurrent peers that never synced; a streaming "regression" that
 * was 100 `setTimeout(0)` yields). This table is the check against
 * that class of error.
 */
export const SCALE1_FIXTURE_AUDIT: readonly FixtureAuditRow[] = [
	{
		id: "blocks-100",
		fixture: "`generateBlockSpecs(100)` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text in a 100-block document",
		actualSubject:
			"100 mixed heading/code/paragraph blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "load-taken",
		floorKind: "empty-timer",
		howMeasured:
			"count: blockOrder.length === 100; one insert-text. Wall is load-taken 2026-08-20 minus empty-timer floor; construction outside the clock",
	},
	{
		id: "blocks-1000",
		fixture: "`generateBlockSpecs(1000)` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text in a 1,000-block document",
		actualSubject:
			"1,000 mixed blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "load-taken",
		floorKind: "empty-timer",
		howMeasured:
			"count: blockOrder.length === 1000; one insert-text. Wall is load-taken 2026-08-20 minus empty-timer floor; construction outside the clock",
	},
	{
		id: "blocks-5000",
		fixture: "`generateBlockSpecs(5000)` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text in a 5,000-block document",
		actualSubject:
			"5,000 mixed blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "load-taken",
		floorKind: "empty-timer",
		howMeasured:
			"count: blockOrder.length === 5000; one insert-text. Wall is load-taken 2026-08-20 minus empty-timer floor; construction outside the clock",
	},
	{
		id: "long-block",
		fixture: "`generateLongBlockSpec` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text at the end of a 100k-character block",
		actualSubject:
			"One paragraph of 100,000 `A` characters. Timed work is one `insert-text` at offset 100000.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "load-taken",
		floorKind: "empty-timer",
		howMeasured:
			"count: textContent().length === 100000; one insert-text. Wall is load-taken 2026-08-20 minus empty-timer floor; construction outside the clock",
	},
	{
		id: "nesting-10",
		fixture: "`buildNestingYDoc` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text at nesting depth 10",
		actualSubject:
			"Ten nested callouts as the only top-level tree (empty-editor default paragraph removed). Timed work is one `insert-text` on the innermost block.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "load-taken",
		floorKind: "empty-timer",
		howMeasured:
			"count: measureNestingDepth === 10; one insert-text. Wall is load-taken 2026-08-20 minus empty-timer floor",
	},
	{
		id: "table-50x20",
		fixture: "`buildTableYDoc` / `createEnvelopeEditor`",
		claimedSubject: "one cell insert in a 50×20 table",
		actualSubject:
			"A 50-row × 20-column table as the only top-level block. Timed work is one `insert-table-cell-text` on the last cell.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "load-taken",
		floorKind: "empty-timer",
		howMeasured:
			"count: 50 rows × 20 cols; one insert-table-cell-text. Wall is load-taken 2026-08-20 minus empty-timer floor",
	},
	{
		id: "concurrentPeers-2",
		fixture: "`createEnvelopeCollaboration` → `createTwoPeerHarness`",
		claimedSubject: "concurrent 2-peer edit",
		actualSubject:
			"Shared-seed fork so peer B can receive peer A's insert (the independently-populated fixture could not). Timed work is peer A `insert-text` plus `sync()`. Peer B does not write during the clock.",
		verdict: "name-overstates",
		countTrust: "trusted",
		clockTrust: "untrustworthy",
		floorKind: "empty-sync",
		howMeasured:
			"count: 2 peers and B observation asserted before the clock. Wall is load-taken 2026-08-20 (1.49ms vs later isolated 0.198ms) minus empty-sync floor",
	},
];

/**
 * Other benches that have already published a wrong subject, or whose
 * name is the same class of risk. Not SCALE1 rungs; listed so the
 * next envelope row does not repeat them.
 */
export const RELATED_FIXTURE_AUDIT: readonly FixtureAuditRow[] = [
	{
		id: "streaming.gen-delta-1000-parts",
		fixture: "`streaming.bench.ts` 1000-part harness",
		claimedSubject: "1000 gen-delta parts through `editor.apply`",
		actualSubject:
			"1000 `appendDelta` calls plus 100 `setTimeout(0)` yields. Same-run yield floor is ~115ms; coalesced no-yield work is ~0.13ms and one apply. The clock is the scheduler.",
		verdict: "wrong-subject",
		countTrust: "trusted",
		clockTrust: "untrustworthy",
		floorKind: "yield-macrotasks",
		howMeasured:
			"count: apply-count, not the clock. 1000 appends coalesce to one apply when yields are removed; the wall is 100 macrotasks",
	},
	{
		id: "scale3.peer-count.8",
		fixture: "`createScale3Editor` peer-count axis",
		claimedSubject: "keystroke with 8 remote peers",
		actualSubject:
			"Eight `data-pen-remote-caret` decorations on the multiplayer stand-in. No second Y.Doc, no sync.",
		verdict: "name-overstates",
		countTrust: "trusted",
		clockTrust: "untrustworthy",
		floorKind: "empty-timer",
		howMeasured:
			"count: 8 remote-caret decorations. Clock is a keystroke median on a single editor, not a synced Y.Doc count",
	},
	{
		id: "createLargeDocument",
		fixture: "`createLargeDocument(n)`",
		claimedSubject: "n-block document (SCALE3 / CRDT / schema)",
		actualSubject:
			"n blocks written with `adapter.transact` + `initBlockMap`, not `editor.apply`. Different generator than the SCALE1 envelope specs.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "not-a-clock",
		floorKind: "unmeasurable",
		howMeasured:
			"count: blockOrder.length === n. Size is a block count asserted by the fixture, not a timed envelope row",
	},
	{
		id: "crdt.fork-merge-100",
		fixture: "`crdt.bench.ts` fork + merge",
		claimedSubject: "fork + merge 100-block document",
		actualSubject:
			"Forks a 100-block Y.Doc, inserts FORK-MERGE-TOKEN on block-50 of the fork, then clocks merge into the target. Observation after the clock names block-50.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "load-taken",
		floorKind: "empty-timer",
		howMeasured:
			"count: target block-50 contains FORK-MERGE-TOKEN after merge. A skipped merge or a self-copy fails assertMergeTransferred",
	},
	{
		id: "generateGenDeltaParts",
		fixture: "`fixtures/streamingParts.ts`",
		claimedSubject: "1000 gen-delta parts for the streaming bench",
		actualSubject:
			"Consumed inside the 1000-part clock. generateGenDeltaParts must produce 1000 gen-delta parts; the named block must contain the last token after the clock.",
		verdict: "agrees",
		countTrust: "trusted",
		clockTrust: "not-a-clock",
		floorKind: "unmeasurable",
		howMeasured:
			"count: 1000 gen-delta parts and last token on the named block. If the helper returned [] the bench goes red",
	},
	{
		id: "ai.autocomplete-requesting-cancel-churn",
		fixture: "`ai.bench.ts` requesting-cancel churn",
		claimedSubject: "autocomplete request/cancel cycles",
		actualSubject:
			"Ten request/cancel cycles. The model stream and waitForCondition each clock setTimeout(0). Observation after the clock names requestCount/cancelCount/modelCallCount.",
		verdict: "name-overstates",
		countTrust: "trusted",
		clockTrust: "untrustworthy",
		floorKind: "yield-macrotasks",
		howMeasured:
			"count: requestCount === cancel floor === modelCallCount === 10. A skipped loop fails assertRequestingCancelObserved",
	},
	{
		id: "ai.autocomplete-provider-budget",
		fixture: "`ai.bench.ts` provider budget",
		claimedSubject: "autocomplete provider budget",
		actualSubject:
			"Three providers; the slow one is raced against setTimeout(5). Observation after the clock names local-shape and refuses slow-timeout.",
		verdict: "name-overstates",
		countTrust: "trusted",
		clockTrust: "untrustworthy",
		floorKind: "delayed-timer",
		howMeasured:
			"count: local-shape present, slow-timeout absent, clipped chars <= 48. A skipped request fails assertProviderBudgetObserved",
	},
];

export function getScale1FixtureAudit(id: EnvelopeRungId): FixtureAuditRow {
	const row = SCALE1_FIXTURE_AUDIT.find((entry) => entry.id === id);
	if (!row) {
		throw new Error(`SCALE1 fixture audit missing for ${id}`);
	}
	return row;
}

export function assertScale1AuditCoversMeasurements(): void {
	const auditIds = SCALE1_FIXTURE_AUDIT.map((row) => row.id);
	const measurementIds = SCALE1_MEASUREMENTS.map((spec) => spec.id);
	if (auditIds.length !== measurementIds.length) {
		throw new Error(
			"SCALE1 fixture audit count does not match measurements",
		);
	}
	for (const id of measurementIds) {
		if (!auditIds.includes(id)) {
			throw new Error(`SCALE1 fixture audit missing ${id}`);
		}
	}
}
