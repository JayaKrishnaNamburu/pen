import type { DocumentOp } from "@input/pen-types";
import { expect } from "@playwright/test";
import { caretCacheHolds } from "../harness/src/geometryCompare";
import { scenario } from "../src/scenario";
import type { GeometryBlockInfo, GeometryCaretCompareResult } from "../src/types";
import { sampleCaretPoints } from "../src/wave3Geometry";

type CommitStep = {
	name: string;
	ops: (blocks: readonly GeometryBlockInfo[]) => DocumentOp[];
};

const COMMIT_STEPS: readonly CommitStep[] = [
	{
		name: "insert-text at the start of the first block",
		ops: (blocks) => {
			const block = blocks[0];
			if (!block) return [];
			return [{ type: "insert-text", blockId: block.id, offset: 0, text: "!" }];
		},
	},
	{
		name: "insert-text at the end of the first block",
		ops: (blocks) => {
			const block = blocks[0];
			if (!block) return [];
			return [
				{
					type: "insert-text",
					blockId: block.id,
					offset: block.length,
					text: "Z",
				},
			];
		},
	},
	{
		name: "delete-text from the middle of the first block",
		ops: (blocks) => {
			const block = blocks[0];
			if (!block || block.length < 2) return [];
			return [
				{
					type: "delete-text",
					blockId: block.id,
					offset: 1,
					length: 1,
				},
			];
		},
	},
	{
		name: "replace-text in the first block",
		ops: (blocks) => {
			const block = blocks[0];
			if (!block || block.length < 2) return [];
			return [
				{
					type: "replace-text",
					blockId: block.id,
					offset: 0,
					length: 1,
					text: "Q",
				},
			];
		},
	},
	{
		name: "insert-text long enough to grow the first block",
		ops: (blocks) => {
			const block = blocks[0];
			if (!block) return [];
			return [
				{
					type: "insert-text",
					blockId: block.id,
					offset: block.length,
					text: " GROW-THE-BLOCK-WITH-A-LONG-RUN-OF-CHARACTERS",
				},
			];
		},
	},
	{
		name: "insert-inline-node mention in the atoms block",
		ops: (blocks) => {
			const block = blocks.find((entry) => entry.id === "g5-atoms");
			if (!block) return [];
			return [
				{
					type: "insert-inline-node",
					blockId: block.id,
					offset: Math.min(5, block.length),
					nodeType: "mention",
					props: { id: "user-ada", label: "Ada" },
				},
			];
		},
	},
	{
		name: "insert-block after the last block",
		ops: (blocks) => {
			const last = blocks[blocks.length - 1];
			if (!last) return [];
			return [
				{
					type: "insert-block",
					blockId: "g2-after",
					blockType: "paragraph",
					props: {},
					position: { after: last.id },
				},
				{
					type: "insert-text",
					blockId: "g2-after",
					offset: 0,
					text: "After",
				},
			];
		},
	},
	{
		name: "insert-block before the first block",
		ops: (blocks) => {
			const first = blocks[0];
			if (!first) return [];
			return [
				{
					type: "insert-block",
					blockId: "g2-before",
					blockType: "paragraph",
					props: {},
					position: { before: first.id },
				},
				{
					type: "insert-text",
					blockId: "g2-before",
					offset: 0,
					text: "Before",
				},
			];
		},
	},
	{
		name: "split-block the tail paragraph",
		ops: (blocks) => {
			const tail = blocks.find((entry) => entry.id === "g5-tail");
			if (!tail || tail.length < 4) return [];
			return [
				{
					type: "split-block",
					blockId: tail.id,
					offset: 5,
					newBlockId: "g2-split",
				},
			];
		},
	},
	{
		name: "delete-block the inserted after block",
		ops: (blocks) => {
			if (!blocks.some((entry) => entry.id === "g2-after")) return [];
			return [{ type: "delete-block", blockId: "g2-after" }];
		},
	},
];

function formatCacheFailure(
	result: GeometryCaretCompareResult,
	step: string,
): string {
	const lines = result.compares
		.filter(
			(entry) =>
				entry.stale || entry.cached == null || entry.fromScratch == null,
		)
		.map((entry) => {
			const cached = JSON.stringify(entry.cached);
			const fresh = JSON.stringify(entry.fromScratch);
			return `${entry.point.blockId}:${entry.point.offset}:${entry.affinity} cached=${cached} fresh=${fresh}`;
		});
	return `G2 ${step}: ${result.staleCount} stale, ${result.missingCount} missing caretRect(s)\n${lines.join("\n")}`;
}

scenario(
	"G2 SCH1: after any commit sequence caretRect equals a from-scratch measurement",
	async (s, page) => {
		await s.load("wave3-geometry");

		const failures: string[] = [];

		async function assertCachedEqualsFresh(step: string): Promise<void> {
			const blocks = await s.geometry.blocks();
			const points = sampleCaretPoints(blocks);
			expect(points.length).toBeGreaterThan(0);
			await s.geometry.warm(points);
			const result = await s.geometry.compare(points);
			if (!caretCacheHolds(result)) {
				failures.push(formatCacheFailure(result, step));
			}
		}

		await assertCachedEqualsFresh("initial document");

		for (const step of COMMIT_STEPS) {
			const blocks = await s.geometry.blocks();
			const ops = step.ops(blocks);
			if (ops.length === 0) {
				continue;
			}

			const points = sampleCaretPoints(blocks);
			await s.geometry.warm(points);
			await s.apply(ops);
			await expect
				.poll(async () => {
					return page.evaluate(() => {
						const ids = window.__penConformance.blockIds;
						return ids.every(
							(id) => document.querySelector(`[data-block-id="${id}"]`) != null,
						);
					});
				})
				.toBe(true);

			const mention = ops.some((op) => op.type === "insert-inline-node");
			if (mention) {
				await expect(page.locator("[data-pen-inline-atom]")).toBeVisible();
			}
			const inserted = ops.find((op) => op.type === "insert-block");
			if (inserted && inserted.type === "insert-block") {
				await expect(
					page.locator(`[data-block-id="${inserted.blockId}"]`),
				).toBeVisible();
			}
			const deleted = ops.find((op) => op.type === "delete-block");
			if (deleted && deleted.type === "delete-block") {
				await expect(
					page.locator(`[data-block-id="${deleted.blockId}"]`),
				).toHaveCount(0);
			}
			const split = ops.find((op) => op.type === "split-block");
			if (split && split.type === "split-block") {
				await expect(
					page.locator(`[data-block-id="${split.newBlockId}"]`),
				).toBeVisible();
			}

			const after = await s.geometry.blocks();
			const result = await s.geometry.compare(sampleCaretPoints(after));
			if (!caretCacheHolds(result)) {
				failures.push(formatCacheFailure(result, step.name));
			}
		}

		const beforeRemote = sampleCaretPoints(await s.geometry.blocks());
		await s.geometry.warm(beforeRemote);
		await s.remote.splice({
			block: 0,
			from: 0,
			to: 0,
			insert: "R",
		});
		await expect(page.locator("[data-pen-inline-content]").first()).toBeVisible();
		const afterRemote = await s.geometry.compare(
			sampleCaretPoints(await s.geometry.blocks()),
		);
		if (!caretCacheHolds(afterRemote)) {
			failures.push(formatCacheFailure(afterRemote, "remote splice"));
		}

		expect(
			failures,
			[
				"G2: cached caretRect went stale or missing after a commit that moved unedited blocks (invalidation is summary-block-only; neighbors keep the old Y; both-null is missing, not equal).",
				...failures,
			].join("\n\n"),
		).toEqual([]);
	},
);
