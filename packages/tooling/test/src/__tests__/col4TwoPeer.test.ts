import { beforeEach, describe, expect, it } from "vitest";
import {
	applyCycleMoves,
	assertCycleCurrentlySurvives,
	col4CycleOptions,
	COL4_CONVERGENCE_SCENARIOS,
	runCol4Scenario,
	runCol4SeededFuzz,
} from "../col4Scenarios";
import {
	countMemberships,
	listBlockIds,
	parentsOf,
	resetTestIdCounter,
	runBothInterleavings,
	visibleText,
} from "../index";
import type { TwoPeerHarness } from "../types";

beforeEach(() => {
	resetTestIdCounter();
});

describe("COL4 two-peer structural concurrency", () => {
	it("COL4: harness uses two adapters and incremental encodeUpdate/applyUpdate", () => {
		runBothInterleavings(
			{ blocks: [{ id: "p1", type: "paragraph", content: "Hello" }] },
			(harness, interleaving) => {
				expect(harness.peerA.adapter).not.toBe(harness.peerB.adapter);
				expect(harness.peer("a")).toBe(harness.peerA);
				expect(harness.peer("b")).toBe(harness.peerB);

				harness.peerA.editor.apply([
					{
						type: "insert-text",
						blockId: "p1",
						offset: 5,
						text: " A",
					},
				]);
				harness.peerB.editor.apply([
					{
						type: "insert-text",
						blockId: "p1",
						offset: 5,
						text: " B",
					},
				]);

				const { fromA, fromB } = harness.captureUpdates();
				const fullA = harness.peerA.adapter.encodeState(harness.peerA.crdtDoc);
				const fullB = harness.peerB.adapter.encodeState(harness.peerB.crdtDoc);
				expect(fromA.byteLength).toBeLessThan(fullA.byteLength);
				expect(fromB.byteLength).toBeLessThan(fullB.byteLength);

				harness.exchange(interleaving);
				harness.assertConverged();
				expect(visibleText(harness.peerA.editor)).toContain("Hello");
				expect(visibleText(harness.peerA.editor)).toContain("A");
				expect(visibleText(harness.peerA.editor)).toContain("B");
			},
		);
	});

	it.each(COL4_CONVERGENCE_SCENARIOS.map((scenario) => [scenario.name, scenario]))(
		"%s",
		(_name, scenario) => {
			runCol4Scenario(scenario);
		},
	);

	it("COL4: delete a block wins over concurrent typing (Yjs semantics)", () => {
		runBothInterleavings(
			{ blocks: [{ id: "p1", type: "paragraph", content: "Keep" }] },
			(harness) => {
				harness.peerA.editor.apply([{ type: "delete-block", blockId: "p1" }]);
				harness.peerB.editor.apply([
					{
						type: "insert-text",
						blockId: "p1",
						offset: 4,
						text: " lost",
					},
				]);
			},
			(harness) => {
				expect(listBlockIds(harness.peerA.editor)).not.toContain("p1");
				expect(listBlockIds(harness.peerB.editor)).not.toContain("p1");
				expect(visibleText(harness.peerA.editor)).not.toContain("lost");
			},
		);
	});

	it("COL4: indent and outdent of the same list item converge to one parent", () => {
		runBothInterleavings(
			{
				blocks: [
					{ id: "l1", type: "bulletListItem", content: "One" },
					{ id: "l2", type: "bulletListItem", content: "Two" },
				],
			},
			(harness) => {
				harness.peerA.editor.apply([
					{
						type: "update-block",
						blockId: "l2",
						props: { indent: 1, parentId: "l1" },
					},
				]);
				harness.peerB.editor.apply([
					{
						type: "update-block",
						blockId: "l2",
						props: { indent: 0, parentId: null },
					},
				]);
			},
			(harness) => {
				expect(parentsOf(harness.peerA.editor, "l2").length).toBeLessThanOrEqual(
					1,
				);
				expect(countMemberships(harness.peerA.editor, "l2")).toBe(1);
			},
		);
	});

	it("COL4: overlapping reorder has no duplicate order entries after repair", () => {
		runBothInterleavings(
			{
				blocks: [
					{ id: "p1", type: "paragraph", content: "One" },
					{ id: "p2", type: "paragraph", content: "Two" },
					{ id: "p3", type: "paragraph", content: "Three" },
				],
			},
			(harness) => {
				harness.peerA.editor.apply([
					{
						type: "move-block",
						blockId: "p3",
						position: "first",
					},
				]);
				harness.peerB.editor.apply([
					{
						type: "move-block",
						blockId: "p3",
						position: { after: "p1" },
					},
				]);
			},
			(harness) => {
				expect(duplicateIds(blockOrderIds(harness))).toEqual([]);
				expect(new Set(blockOrderIds(harness)).size).toBe(3);
			},
		);
	});

	it("COL4: A-into-B / B-into-A converges with a surviving parent cycle (known gap)", () => {
		runBothInterleavings(
			col4CycleOptions,
			applyCycleMoves,
			(harness) => {
				assertCycleCurrentlySurvives(harness);
			},
		);
	});

	it("COL4: seeded random op pairs converge in both interleavings", () => {
		runCol4SeededFuzz();
	});
});

function blockOrderIds(harness: TwoPeerHarness): string[] {
	const order = harness.peerA.editor.document.blockOrder;
	const ids: string[] = [];
	for (let i = 0; i < order.length; i++) {
		ids.push(order.get(i));
	}
	return ids;
}

function duplicateIds(ids: string[]): string[] {
	const seen = new Set<string>();
	const duplicates: string[] = [];
	for (const id of ids) {
		if (seen.has(id)) {
			duplicates.push(id);
			continue;
		}
		seen.add(id);
	}
	return duplicates;
}
