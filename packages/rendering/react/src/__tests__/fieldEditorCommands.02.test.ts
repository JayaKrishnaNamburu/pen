import { describe, expect, it } from "vitest";
import { createEditor, getNumberedListItemValue } from "@pen/core";
import {
	FIELD_EDITOR_SLOT_KEY as CORE_FIELD_EDITOR_SLOT_KEY,
	INPUT_RULES_ENGINE_SLOT_KEY,
} from "@pen/types";
import { defaultPreset } from "@pen/preset-default";
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
} from "../field-editor/commands";
import { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
import type { FieldEditorTextLike } from "../field-editor/crdt";

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

describe("@pen/react field-editor commands", () => {
	it("moves to the previous block at the logical start", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
		]);

		const secondYText = getYText(editor, secondBlockId);
		const target = moveCaretAcrossBlocks(editor, {
			blockId: secondBlockId,
			ytext: secondYText,
			range: { start: 1, end: 1 },
			direction: "previous",
		});

		expect(target).toEqual({
			blockId: firstBlockId,
			anchorOffset: 5,
			focusOffset: 5,
		});

		editor.destroy();
	});

	it("moves to the next block at the logical end", () => {
		const editor = createEditor(editorOpts());
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
		]);

		const firstYText = getYText(editor, firstBlockId);
		const target = moveCaretAcrossBlocks(editor, {
			blockId: firstBlockId,
			ytext: firstYText,
			range: { start: 5, end: 5 },
			direction: "next",
		});

		expect(target).toEqual({
			blockId: secondBlockId,
			anchorOffset: 0,
			focusOffset: 0,
		});

		editor.destroy();
	});

	it("skips hidden toggle children when moving through visible blocks", () => {
		const editor = createEditor(editorOpts());
		const toggleBlockId = editor.firstBlock()!.id;
		const childBlockId = crypto.randomUUID();
		const afterBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "convert-block",
				blockId: toggleBlockId,
				newType: "toggle",
				newProps: { open: false },
			},
			{
				type: "insert-text",
				blockId: toggleBlockId,
				offset: 0,
				text: "Toggle",
			},
			{
				type: "insert-block",
				blockId: childBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: toggleBlockId },
			},
			{
				type: "insert-text",
				blockId: childBlockId,
				offset: 0,
				text: "Hidden child",
			},
			{
				type: "update-block",
				blockId: childBlockId,
				props: { parentId: toggleBlockId },
			},
			{
				type: "insert-block",
				blockId: afterBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: childBlockId },
			},
			{
				type: "insert-text",
				blockId: afterBlockId,
				offset: 0,
				text: "After toggle",
			},
		]);

		const toggleYText = getYText(editor, toggleBlockId);
		const target = moveCaretAcrossBlocks(editor, {
			blockId: toggleBlockId,
			ytext: toggleYText,
			range: { start: 6, end: 6 },
			direction: "next",
		});

		expect(target).toEqual({
			blockId: afterBlockId,
			anchorOffset: 0,
			focusOffset: 0,
		});

		editor.destroy();
	});

});
