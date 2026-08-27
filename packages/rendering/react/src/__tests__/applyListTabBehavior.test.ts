import { describe, expect, it } from "vitest";
import { createEditor, getNumberedListItemValue } from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import {
	applyDeleteBehavior,
	applyListInputRule,
	applyBackspaceBehavior,
	applyEnterBehavior,
	applyListTabBehavior,
	getLogicalInlineLength,
	moveCaretAcrossBlocks,
	normalizeInlineOffset,
	resolveBackspaceAction,
	resolveEnterAction,
	splitBlockAtOffset,
	toggleInlineMark,
} from "@input/pen-dom/field-editor/commands";
import { FieldEditorImpl } from "@input/pen-dom/field-editor/fieldEditorImpl";
import type { FieldEditorTextLike } from "@input/pen-dom/field-editor/crdt";

type BlocksMapLike = {
	get(key: string): { get(field: string): unknown } | undefined;
};

type RawDocLike = {
	getMap(name: string): BlocksMapLike;
};

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

function getYText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): FieldEditorTextLike {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw<RawDocLike>(doc);
	const ytext = ydoc
		.getMap("blocks")
		.get(blockId)
		?.get("content") as FieldEditorTextLike | null;
	if (!ytext) {
		throw new Error(`Missing test Y.Text for block ${blockId}`);
	}
	return ytext;
}

function editorOpts() {
	return {
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	};
}

describe("applyListTabBehavior", () => {
	it("Tab indents a list item when the previous sibling can own the nesting", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "set-props",
				blockId: firstBlockId,
				props: { type: "bulletListItem" },
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "bulletListItem",
				props: { indent: 0 },
				position: { after: firstBlockId },
			},
			{
				type: "splice-text",
				blockId: secondBlockId,
				from: 0,
				to: 0,
				insert: "child",
			},
		]);

		const target = applyListTabBehavior(editor, {
			blockId: secondBlockId,
			ytext: getYText(editor, secondBlockId),
			range: { start: 2, end: 2 },
			shiftKey: false,
		});

		expect(target).toEqual({
			blockId: secondBlockId,
			anchorOffset: 2,
			focusOffset: 2,
		});
		expect(editor.getBlock(secondBlockId)?.props.indent).toBe(1);

		editor.destroy();
	});

	it("Tab returns null for a top-level list item without a parent candidate", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "bulletListItem" } },
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "root" },
		]);

		const target = applyListTabBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 4, end: 4 },
			shiftKey: false,
		});

		expect(target).toBeNull();
		expect(editor.getBlock(blockId)?.props.indent).toBe(0);

		editor.destroy();
	});

	it("Shift-Tab returns null for an already top-level list item", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "bulletListItem" } },
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "root" },
		]);

		const target = applyListTabBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 1, end: 3 },
			shiftKey: true,
		});

		expect(target).toBeNull();
		expect(editor.getBlock(blockId)?.props.indent).toBe(0);

		editor.destroy();
	});

	it("Shift-Tab outdents a nested list item", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "set-props",
				blockId: firstBlockId,
				props: { type: "bulletListItem" },
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "bulletListItem",
				props: { indent: 1 },
				position: { after: firstBlockId },
			},
			{
				type: "splice-text",
				blockId: secondBlockId,
				from: 0,
				to: 0,
				insert: "child",
			},
		]);

		const target = applyListTabBehavior(editor, {
			blockId: secondBlockId,
			ytext: getYText(editor, secondBlockId),
			range: { start: 1, end: 3 },
			shiftKey: true,
		});

		expect(target).toEqual({
			blockId: secondBlockId,
			anchorOffset: 1,
			focusOffset: 3,
		});
		expect(editor.getBlock(secondBlockId)?.props.indent).toBe(0);

		editor.destroy();
	});
});
