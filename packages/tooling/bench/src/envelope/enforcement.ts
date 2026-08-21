import { SCALE1_MEASUREMENTS } from "../constants/scale1";
import { RELATED_FIXTURE_AUDIT, SCALE1_FIXTURE_AUDIT } from "../fixtures/audit";

export type UnitEnforcement = "enforced" | "record-only" | "n/a";
export type IsolatedClock =
	| "gated"
	| "record-only"
	| "decorative"
	| "untrusted-gated";

/**
 * Honest enforced-vs-record-only inventory. A row that cannot fail is
 * record-only even if a clock column exists. The unit suite never
 * compares a live wall-clock to a budget.
 */
export interface EnforcementRow {
	id: string;
	subject: string;
	unit: UnitEnforcement;
	unitFailsOn: string;
	isolatedClock: IsolatedClock;
	clockNote: string;
}

export const ENFORCEMENT_INVENTORY: readonly EnforcementRow[] = [
	{
		id: "blocks-100",
		subject: "100-block insert-text",
		unit: "enforced",
		unitFailsOn: "blockOrder.length !== 100",
		isolatedClock: "record-only",
		clockNote: "attributed p50 below 0.5ms signal; ratio is timer noise",
	},
	{
		id: "blocks-1000",
		subject: "1,000-block insert-text",
		unit: "enforced",
		unitFailsOn: "blockOrder.length !== 1000",
		isolatedClock: "gated",
		clockNote: "same-class 3× attributed median; not compared in unit suite",
	},
	{
		id: "blocks-5000",
		subject: "5,000-block insert-text",
		unit: "enforced",
		unitFailsOn: "blockOrder.length !== 5000",
		isolatedClock: "gated",
		clockNote: "same-class 3× attributed median; not compared in unit suite",
	},
	{
		id: "long-block",
		subject: "100k-character insert-text",
		unit: "enforced",
		unitFailsOn: "textContent().length !== 100000",
		isolatedClock: "record-only",
		clockNote: "attributed p50 below 0.5ms signal",
	},
	{
		id: "nesting-10",
		subject: "nesting depth 10 insert-text",
		unit: "enforced",
		unitFailsOn: "measureNestingDepth !== 10",
		isolatedClock: "record-only",
		clockNote: "attributed p50 below 0.5ms signal",
	},
	{
		id: "table-50x20",
		subject: "50×20 table cell insert",
		unit: "enforced",
		unitFailsOn: "row/col counts !== 50/20",
		isolatedClock: "record-only",
		clockNote: "attributed p50 below 0.5ms signal",
	},
	{
		id: "concurrentPeers-2",
		subject: "2-peer A insert + sync",
		unit: "enforced",
		unitFailsOn:
			"assertPeerBObservesPeerAInsert: B missing A's token after sync",
		isolatedClock: "untrusted-gated",
		clockNote:
			"committed wall 1.49ms vs later isolated 0.198ms; load-taken, not reproduced",
	},
	{
		id: "streaming.gen-delta-1000-parts",
		subject: "1000 gen-delta parts",
		unit: "enforced",
		unitFailsOn: "apply count is not < 1000 when the harness yields",
		isolatedClock: "record-only",
		clockNote: "clock is 100 setTimeout(0) yields; critical is false",
	},
	{
		id: "streaming.batch-flush-latency",
		subject: "streaming batch flush",
		unit: "enforced",
		unitFailsOn: "timedApplyCount !== 0 inside the timed window",
		isolatedClock: "decorative",
		clockNote:
			"critical:true but timedApplyCount is 0; the apply is after b.end()",
	},
	{
		id: "scale3.peer-count.8",
		subject: "SCALE3 peer-count 8",
		unit: "enforced",
		unitFailsOn: "remote-caret decorations !== 8 or a second Y.Doc appears",
		isolatedClock: "decorative",
		clockNote:
			"critical:true with ~13× slack (3.73ms → 50ms); peer count is decorations",
	},
	{
		id: "scale3.keystroke.realistic-stack",
		subject: "SCALE3 realistic-stack keystroke clocks",
		unit: "record-only",
		unitFailsOn: "synthetic gate compare only; no live p50 assertion",
		isolatedClock: "decorative",
		clockNote:
			"critical:true; gates are 25–50ms on 0.5–3.8ms medians (7–50× slack)",
	},
	{
		id: "createLargeDocument",
		subject: "n-block SCALE3/CRDT fixture",
		unit: "enforced",
		unitFailsOn: "blockOrder.length !== n",
		isolatedClock: "record-only",
		clockNote: "size is a count, not a timed envelope row",
	},
	{
		id: "wave3-typing-budget.chromium",
		subject: "Chromium typing budget (other package)",
		unit: "n/a",
		unitFailsOn: "none — @input/pen-conformance record-only scenario",
		isolatedClock: "record-only",
		clockNote:
			"sch-typing-budget.record.spec.ts writes drift; RECORD_TYPING_BUDGET=1 to update; no budget assert",
	},
];

export function assertEnforcementInventoryCoversFixtures(): void {
	const ids = new Set(ENFORCEMENT_INVENTORY.map((row) => row.id));
	for (const spec of SCALE1_MEASUREMENTS) {
		if (!ids.has(spec.id)) {
			throw new Error(`enforcement inventory missing SCALE1 ${spec.id}`);
		}
	}
	for (const row of [...SCALE1_FIXTURE_AUDIT, ...RELATED_FIXTURE_AUDIT]) {
		if (!ids.has(row.id)) {
			throw new Error(`enforcement inventory missing audit ${row.id}`);
		}
	}
}

export function assertNoUnitClockGates(): void {
	for (const row of ENFORCEMENT_INVENTORY) {
		if (row.unit === "enforced" && row.unitFailsOn.includes("p50")) {
			throw new Error(
				`${row.id} claims unit enforcement of a wall-clock; the unit suite must not`,
			);
		}
	}
}
