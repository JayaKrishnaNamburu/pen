import { describe, expect, it } from "vitest";

import { applyMergeBlocks, applySplitBlock, deriveContentMoves, repairAnchor } from "../index";
import { createEditor as createCoreEditor } from "../index";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor() {
	return createCoreEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function visible(editor: ReturnType<typeof createEditor>, blockId: string): string {
	return editor.getBlock(blockId)!.textContent();
}

describe("anchorRepair AN14", () => {
	it("AN14: split fixtures match the validation §3 table and v2 mapPoint retargets", () => {
		const editor = createEditor();
		const source = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId: source, from: 0,
				to: 0,
				insert: "meadow sage" },
		]);
		const head = editor.anchors.create({ blockId: source, offset: 3 }, 1)!;
		const splitBefore = editor.anchors.create({ blockId: source, offset: 6 }, -1)!;
		const splitAfter = editor.anchors.create({ blockId: source, offset: 6 }, 1)!;
		const tail = editor.anchors.create({ blockId: source, offset: 9 }, 1)!;

		applySplitBlock(editor, {
			blockId: source,
			offset: 6,
			newBlockId: "dest",
		});
		expect(visible(editor, source)).toBe("meadow");
		expect(visible(editor, "dest")).toBe(" sage");

		const moves = deriveContentMoves(editor.lastChangeSummary!, undefined);
		expect(moves).toEqual([
			{
				fromBlockId: source,
				fromRange: { from: 6, to: Number.MAX_SAFE_INTEGER },
				toBlockId: "dest",
				toOffset: 0,
			},
		]);

		const repairedHead = repairAnchor(editor, head, moves);
		const repairedSplitBefore = repairAnchor(editor, splitBefore, moves);
		const repairedSplitAfter = repairAnchor(editor, splitAfter, moves);
		const repairedTail = repairAnchor(editor, tail, moves);

		expect(editor.anchors.resolve(head)).toEqual({ blockId: source, offset: 3 });
		expect(editor.anchors.resolve(splitBefore)).toEqual({
			blockId: source,
			offset: 6,
		});
		expect(editor.anchors.resolve(splitAfter)).toEqual({
			blockId: source,
			offset: 6,
		});
		expect(editor.anchors.resolve(tail)).toEqual({
			blockId: source,
			offset: 6,
		});

		expect(repairedHead).toBe(head);
		expect(editor.anchors.resolve(repairedSplitBefore)).toEqual({
			blockId: source,
			offset: 6,
		});
		expect(editor.anchors.resolve(repairedSplitAfter)).toEqual({
			blockId: "dest",
			offset: 0,
		});
		expect(editor.anchors.resolve(repairedTail)).toEqual({
			blockId: "dest",
			offset: 3,
		});
		editor.destroy();
	});

	it("AN14: merge fixtures match the validation §3 table", () => {
		const editor = createEditor();
		const target = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId: target, from: 0,
				to: 0,
				insert: "meadow" },
			{
				type: "insert-block",
				blockId: "source",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "splice-text", blockId: "source", from: 0,
				to: 0,
				insert: " sage" },
		]);
		const onTarget = editor.anchors.create({ blockId: target, offset: 3 }, 1)!;
		const onSource = editor.anchors.create({ blockId: "source", offset: 1 }, 1)!;

		applyMergeBlocks(editor, {
			targetBlockId: target,
			sourceBlockId: "source",
		});
		expect(visible(editor, target)).toBe("meadow sage");
		expect(editor.getBlock("source")).toBeNull();
		expect(editor.anchors.resolve(onSource)).toBeNull();

		const moves = deriveContentMoves(editor.lastChangeSummary!, undefined);
		expect(moves).toEqual([
			{
				fromBlockId: "source",
				fromRange: { from: 0, to: Number.MAX_SAFE_INTEGER },
				toBlockId: target,
				toOffset: 6,
			},
		]);
		expect(repairAnchor(editor, onTarget, moves)).toBe(onTarget);
		expect(editor.anchors.resolve(repairAnchor(editor, onSource, moves))).toEqual({
			blockId: target,
			offset: 7,
		});
		editor.destroy();
	});

	it("AN14: remote-shaped delete/insert pairing derives the same split move", () => {
		const editor = createEditor();
		const source = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId: source, from: 0,
				to: 0,
				insert: "meadow sage" },
		]);
		const summary = {
			commitId: 1,
			blockText: [
				{
					blockId: source,
					splices: [{ from: 6, to: 11, insertLength: 0 }],
					formatRanges: [],
				},
				{
					blockId: "dest",
					splices: [{ from: 0, to: 0, insertLength: 5 }],
					formatRanges: [],
				},
			],
			structural: [],
			affectedBlockIds: [source, "dest"],
		};
		expect(deriveContentMoves(summary, undefined)).toEqual([
			{
				fromBlockId: source,
				fromRange: { from: 6, to: 11 },
				toBlockId: "dest",
				toOffset: 0,
			},
		]);
		editor.destroy();
	});

	it("AN10: in-cell edits produce no content moves and repair is identity", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 1, col: 1 },
			from: 0,
			to: 0,
			insert: "0123456789",
			},
		]);
		const cellAnchor = editor.anchors.create(
			{ blockId: "t1", offset: 5, cell: { row: 1, col: 1 } },
			1,
		)!;
		editor.apply([
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 1, col: 1 },
			from: 0,
			to: 0,
			insert: "xx",
			},
		]);
		const moves = deriveContentMoves(editor.lastChangeSummary!, undefined);
		expect(moves).toEqual([]);
		expect(repairAnchor(editor, cellAnchor, moves)).toBe(cellAnchor);
		expect(editor.anchors.resolve(cellAnchor)).toEqual({
			blockId: "t1",
			offset: 7,
			cell: { row: 1, col: 1 },
		});
		editor.destroy();
	});

	it("AN14: a paragraph split does not retarget a cell anchor", () => {
		const editor = createEditor();
		const source = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId: source, from: 0,
				to: 0,
				insert: "meadow sage" },
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "t1",
				cell: { row: 0, col: 0 },
			from: 0,
			to: 0,
			insert: "cell text",
			},
		]);
		const cellAnchor = editor.anchors.create(
			{ blockId: "t1", offset: 5, cell: { row: 0, col: 0 } },
			1,
		)!;
		applySplitBlock(editor, {
			blockId: source,
			offset: 6,
			newBlockId: "dest",
		});
		const moves = deriveContentMoves(editor.lastChangeSummary!, undefined);
		expect(repairAnchor(editor, cellAnchor, moves)).toBe(cellAnchor);
		expect(editor.anchors.resolve(cellAnchor)).toEqual({
			blockId: "t1",
			offset: 5,
			cell: { row: 0, col: 0 },
		});
		editor.destroy();
	});
});
