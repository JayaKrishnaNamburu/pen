import { describe, expect, it } from "vitest";
import { createEditor, getNumberedListItemValue } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
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
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	};
}

describe("applyDeleteBehavior", () => {
	it("deletes selected text before falling back to character deletion", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
		]);

		const target = applyDeleteBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 1, end: 4 },
			direction: "backward",
		});

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("Ho");
		expect(target).toEqual({
			blockId,
			anchorOffset: 1,
			focusOffset: 1,
		});
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 1 },
			focus: { blockId, offset: 1 },
		});

		editor.destroy();
	});

	it("selects the previous inline node before deleting it with Backspace", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "A" },
			{
				type: "splice-text",
				blockId,
				from: 1,
				to: 1,
				insert: {
					nodeType: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
			{ type: "splice-text", blockId, from: 2, to: 2, insert: "B" },
		]);

		const target = applyDeleteBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 2, end: 2 },
			direction: "backward",
		});

		expect(target).toEqual({
			blockId,
			anchorOffset: 1,
			focusOffset: 2,
		});
		expect(editor.getBlock(blockId)?.inlineDeltas()).toEqual([
			{ insert: "A" },
			{
				insert: {
					type: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
			{ insert: "B" },
		]);

		editor.destroy();
	});

	it("selects the next inline node before deleting it with Delete", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "A" },
			{
				type: "splice-text",
				blockId,
				from: 1,
				to: 1,
				insert: {
					nodeType: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
			{ type: "splice-text", blockId, from: 2, to: 2, insert: "B" },
		]);

		const target = applyDeleteBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 1, end: 1 },
			direction: "forward",
		});

		expect(target).toEqual({
			blockId,
			anchorOffset: 1,
			focusOffset: 2,
		});

		editor.destroy();
	});

	it("deletes a selected inline node range", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "A" },
			{
				type: "splice-text",
				blockId,
				from: 1,
				to: 1,
				insert: {
					nodeType: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
			{ type: "splice-text", blockId, from: 2, to: 2, insert: "B" },
		]);

		const target = applyDeleteBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 1, end: 2 },
			direction: "backward",
		});

		expect(target).toEqual({
			blockId,
			anchorOffset: 1,
			focusOffset: 1,
		});
		expect(editor.getBlock(blockId)?.inlineDeltas()).toEqual([
			{ insert: "AB" },
		]);

		editor.destroy();
	});
});
