import { SCALE1_MEASUREMENTS, type EnvelopeRungId } from "../constants/scale1";

export type FixtureVerdict = "agrees" | "name-overstates" | "wrong-subject";

export interface FixtureAuditRow {
	id: string;
	fixture: string;
	claimedSubject: string;
	actualSubject: string;
	verdict: FixtureVerdict;
	floorKind:
		| "empty-timer"
		| "empty-sync"
		| "yield-macrotasks"
		| "unmeasurable";
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
		floorKind: "empty-timer",
	},
	{
		id: "blocks-1000",
		fixture: "`generateBlockSpecs(1000)` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text in a 1,000-block document",
		actualSubject:
			"1,000 mixed blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock.",
		verdict: "agrees",
		floorKind: "empty-timer",
	},
	{
		id: "blocks-5000",
		fixture: "`generateBlockSpecs(5000)` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text in a 5,000-block document",
		actualSubject:
			"5,000 mixed blocks. Timed work is one `insert-text` on the middle block. Construction is outside the clock.",
		verdict: "agrees",
		floorKind: "empty-timer",
	},
	{
		id: "long-block",
		fixture: "`generateLongBlockSpec` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text at the end of a 100k-character block",
		actualSubject:
			"One paragraph of 100,000 `A` characters. Timed work is one `insert-text` at offset 100000.",
		verdict: "agrees",
		floorKind: "empty-timer",
	},
	{
		id: "nesting-10",
		fixture: "`buildNestingYDoc` / `createEnvelopeEditor`",
		claimedSubject: "one insert-text at nesting depth 10",
		actualSubject:
			"Ten nested callouts. Timed work is one `insert-text` on the innermost block.",
		verdict: "agrees",
		floorKind: "empty-timer",
	},
	{
		id: "table-50x20",
		fixture: "`buildTableYDoc` / `createEnvelopeEditor`",
		claimedSubject: "one cell insert in a 50×20 table",
		actualSubject:
			"A 50-row × 20-column table. Timed work is one `insert-table-cell-text` on the last cell.",
		verdict: "agrees",
		floorKind: "empty-timer",
	},
	{
		id: "concurrentPeers-2",
		fixture: "`createEnvelopeCollaboration` → `createTwoPeerHarness`",
		claimedSubject: "concurrent 2-peer edit",
		actualSubject:
			"Shared-seed fork so peer B can receive peer A's insert (the independently-populated fixture could not). Timed work is peer A `insert-text` plus `sync()`. Peer B does not write during the clock.",
		verdict: "name-overstates",
		floorKind: "empty-sync",
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
		floorKind: "yield-macrotasks",
	},
	{
		id: "scale3.peer-count.8",
		fixture: "`createScale3Editor` peer-count axis",
		claimedSubject: "keystroke with 8 remote peers",
		actualSubject:
			"Eight `data-pen-remote-caret` decorations on the multiplayer stand-in. No second Y.Doc, no sync.",
		verdict: "name-overstates",
		floorKind: "empty-timer",
	},
	{
		id: "createLargeDocument",
		fixture: "`createLargeDocument(n)`",
		claimedSubject: "n-block document (SCALE3 / CRDT / schema)",
		actualSubject:
			"n blocks written with `adapter.transact` + `initBlockMap`, not `editor.apply`. Different generator than the SCALE1 envelope specs.",
		verdict: "agrees",
		floorKind: "unmeasurable",
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
