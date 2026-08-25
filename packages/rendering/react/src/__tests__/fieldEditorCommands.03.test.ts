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

describe("resolveBackspaceAction – schema-aware Backspace", () => {
	it("converts an empty heading to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([{ type: "set-props", blockId, props: { type: "heading" } }]);

		const action = resolveBackspaceAction(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("converts an empty bullet list item to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "bulletListItem" } },
		]);

		const action = resolveBackspaceAction(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("converts an empty blockquote to paragraph even without a previous block", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "blockquote" } },
		]);

		const action = resolveBackspaceAction(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(action).toEqual({ action: "convert", newType: "paragraph" });

		editor.destroy();
	});

	it("keeps paragraph backspace at start as a merge action", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
		]);

		const action = resolveBackspaceAction(editor, {
			blockId: secondBlockId,
			ytext: getYText(editor, secondBlockId),
			range: { start: 0, end: 0 },
		});

		expect(action).toEqual({
			action: "merge",
			targetBlockId: firstBlockId,
		});

		editor.destroy();
	});

	it("deletes an empty childless toggle when there is a previous block", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const toggleBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "Hello",
			},
			{
				type: "insert-block",
				blockId: toggleBlockId,
				blockType: "toggle",
				props: {},
				position: { after: firstBlockId },
			},
		]);

		const action = resolveBackspaceAction(editor, {
			blockId: toggleBlockId,
			ytext: getYText(editor, toggleBlockId),
			range: { start: 0, end: 0 },
		});

		expect(action).toEqual({
			action: "delete",
			targetBlockId: firstBlockId,
		});

		editor.destroy();
	});

	it("does not delete a toggle with nested children on backspace", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const toggleBlockId = crypto.randomUUID();
		const childBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "Hello",
			},
			{
				type: "insert-block",
				blockId: toggleBlockId,
				blockType: "toggle",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-block",
				blockId: childBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: toggleBlockId },
			},
			{
				type: "set-props",
				blockId: childBlockId,
				props: { parentId: toggleBlockId },
			},
		]);

		const action = resolveBackspaceAction(editor, {
			blockId: toggleBlockId,
			ytext: getYText(editor, toggleBlockId),
			range: { start: 0, end: 0 },
		});

		expect(action).toEqual({
			action: "merge",
			targetBlockId: firstBlockId,
		});

		editor.destroy();
	});

});
