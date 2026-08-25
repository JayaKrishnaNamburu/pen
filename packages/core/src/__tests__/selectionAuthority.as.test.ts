import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyMergeBlocks, applySplitBlock, createEditor as createCoreEditor } from "../index";
import type { SelectionAuthorityImpl } from "../editor/selection";
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

type EditorRuntime = {
	_selection: SelectionAuthorityImpl;
	_doc: Parameters<SelectionAuthorityImpl["updateDocument"]>[0];
	_crdtDoc: Parameters<SelectionAuthorityImpl["updateDocument"]>[1];
};

function authorityOf(
	editor: ReturnType<typeof createEditor>,
): SelectionAuthorityImpl {
	return (editor as unknown as EditorRuntime)._selection;
}

describe("SelectionAuthority AS1–AS5", () => {
	it("AS1: a non-collapsed text write mints assoc -1 / +1 local anchors", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId: id, from: 0,
				to: 0,
				insert: "hello" },
		]);
		editor.selectText(id, 1, 4);
		const auth = authorityOf(editor) as unknown as {
			_fromAnchor: { assoc: number; provenance: string } | null;
			_toAnchor: { assoc: number; provenance: string } | null;
		};
		expect(auth._fromAnchor).toMatchObject({
			assoc: -1,
			provenance: "local",
		});
		expect(auth._toAnchor).toMatchObject({ assoc: 1, provenance: "local" });
		editor.destroy();
	});

	it("AS2: a split repairs the held tail anchor onto the destination", () => {
		const editor = createEditor();
		const source = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId: source,
				from: 0,
				to: 0,
				insert: "meadow sage",
			},
		]);
		editor.selectText(source, 9, 9);
		applySplitBlock(editor, {
			blockId: source,
			offset: 6,
			newBlockId: "dest",
		});
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "dest", offset: 3 },
			focus: { blockId: "dest", offset: 3 },
		});
		expect(authorityOf(editor).record.origin).toBe("mapped");
		editor.destroy();
	});

	it("AS2: copy-split of a same-apply insert-block+text retargets the tail onto the destination", () => {
		const editor = createEditor();
		const seed = editor.firstBlock()!.id;
		editor.apply([{ type: "delete-block", blockId: seed }]);
		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "meadow sage",
			},
		]);
		editor.selectText("b1", 9, 9);
		applySplitBlock(editor, {
			blockId: "b1",
			offset: 6,
			newBlockId: "b2",
		});
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "b2", offset: 3 },
			focus: { blockId: "b2", offset: 3 },
		});
		editor.destroy();
	});

	it("AS3: block selection still drops a removed id from the summary", () => {
		const editor = createEditor();
		const initial = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.selectBlocks([initial, "keep"]);
		editor.apply([{ type: "delete-block", blockId: initial }]);
		expect(editor.selection).toMatchObject({
			type: "block",
			blockIds: ["keep"],
		});
		editor.destroy();
	});

	it("AS3: split, merge, and removal retarget without mapPoint", () => {
		const editor = createEditor();
		const seed = editor.firstBlock()!.id;
		editor.apply([{ type: "delete-block", blockId: seed }]);
		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "meadow sage",
			},
		]);
		editor.selectText("b1", 9, 9);
		applySplitBlock(editor, {
			blockId: "b1",
			offset: 6,
			newBlockId: "b2",
		});
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "b2", offset: 3 },
			focus: { blockId: "b2", offset: 3 },
		});

		editor.selectText("b2", 1, 1);
		applyMergeBlocks(editor, {
			targetBlockId: "b1",
			sourceBlockId: "b2",
		});
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "b1", offset: 7 },
			focus: { blockId: "b1", offset: 7 },
		});

		editor.apply([
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "splice-text", blockId: "keep", from: 0,
				to: 0,
				insert: "stay" },
		]);
		editor.selectBlocks(["b1"]);
		editor.apply([{ type: "delete-block", blockId: "b1" }]);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "keep" },
			focus: { blockId: "keep" },
		});
		editor.destroy();
	});

	it("AS3: deleting a selected table falls back to a live neighbor", () => {
		const editor = createEditor();
		const seed = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "grid",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: seed,
				from: 0,
				to: 0,
				insert: "keep",
			},
		]);
		editor.selectCell("grid", 0, 0);
		editor.apply([{ type: "delete-block", blockId: "grid" }]);
		expect(editor.getBlock("grid")).toBeNull();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: seed },
			focus: { blockId: seed },
		});
		editor.destroy();
	});

	it("AS4: the selection surface does not import changes/mapping", () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const read = (module: string) =>
			readFileSync(resolve(here, module), "utf8");

		for (const module of [
			"../editor/selection.ts",
			"../editor/selectionValidation.ts",
			"../editor/selectionCommit.ts",
		]) {
			expect(read(module)).not.toMatch(/changes\/mapping/);
		}
		expect(read("../editor/selection.ts")).toMatch(/anchorRepair/);
	});

	it("AS5: updateDocument releases authority anchors and writes null", () => {
		const editor = createEditor();
		const replacement = createEditor();
		const id = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId: id, from: 0,
				to: 0,
				insert: "keep" },
		]);
		editor.selectText(id, 1, 3);
		const auth = authorityOf(editor) as unknown as {
			updateDocument: SelectionAuthorityImpl["updateDocument"];
			_fromAnchor: { blockId: string } | null;
			_toAnchor: { blockId: string } | null;
		};
		expect(auth._fromAnchor).toMatchObject({ blockId: id });
		expect(auth._toAnchor).toMatchObject({ blockId: id });
		const replacementRuntime = replacement as unknown as EditorRuntime;
		expect(replacementRuntime._crdtDoc).not.toBe(
			(editor as unknown as EditorRuntime)._crdtDoc,
		);
		auth.updateDocument(
			replacementRuntime._doc,
			replacementRuntime._crdtDoc,
		);
		expect(auth._fromAnchor).toBeNull();
		expect(auth._toAnchor).toBeNull();
		expect(editor.selection).toBeNull();
		editor.destroy();
		replacement.destroy();
	});

	it("AN14: remote-shaped empty-structural move repairs the held selection", () => {
		const editor = createEditor();
		const source = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId: source,
				from: 0,
				to: 0,
				insert: "meadow sage",
			},
			{
				type: "insert-block",
				blockId: "dest",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.selectText(source, 9, 9);
		editor.apply([
			{ type: "splice-text", blockId: source, from: 6,
				to: 6 + 5 , insert: "" },
			{ type: "splice-text", blockId: "dest", from: 0,
				to: 0,
				insert: " sage" },
		]);
		expect(editor.lastChangeSummary?.structural).toEqual([]);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "dest", offset: 3 },
			focus: { blockId: "dest", offset: 3 },
		});
		expect(authorityOf(editor).record.origin).toBe("mapped");
		editor.destroy();
	});

	// The test above is this one's positive control. Removing the
	// `structural.length === 0` early return from `_repairHeldAnchors` put the
	// remote fallback on every ordinary commit, and the fallback pairs a delete
	// with any same-length insert in a *different* block. A cross-block
	// find-and-replace produces exactly that shape without moving any content,
	// so it is the case that would strand a caret in the wrong block.
	it("AN14: a cross-block same-length replace is not read as a move", () => {
		const editor = createEditor();
		const a = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId: a, from: 0,
				to: 0,
				insert: "the cat sat" },
			{
				type: "insert-block",
				blockId: "b",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.apply([
			{
				type: "splice-text",
				blockId: "b",
				from: 0,
				to: 0,
				insert: "the cat ran",
			},
		]);
		editor.selectText(a, 5, 5);
		editor.apply([
			{ type: "splice-text", blockId: a, from: 4,
				to: 4 + 3 , insert: "" },
			{ type: "splice-text", blockId: a, from: 4,
				to: 4,
				insert: "dog" },
			{ type: "splice-text", blockId: "b", from: 4,
				to: 4 + 3 , insert: "" },
			{ type: "splice-text", blockId: "b", from: 4,
				to: 4,
				insert: "dog" },
		]);
		expect(editor.lastChangeSummary?.structural).toEqual([]);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: a },
			focus: { blockId: a },
		});
		editor.destroy();
	});
});
