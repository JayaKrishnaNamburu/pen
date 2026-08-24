import { describe, expect, it } from "vitest";
import { createEditor, getNumberedListItemValue } from "@input/pen-core";
import {
	FIELD_EDITOR_SLOT_KEY as CORE_FIELD_EDITOR_SLOT_KEY,
	INPUT_RULES_ENGINE_SLOT_KEY,
} from "@input/pen-types";
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
import { FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";
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

describe("applyBackspaceBehavior – integration", () => {
	it("empty bulletListItem Backspace converts to paragraph", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "bulletListItem" } },
		]);

		const target = applyBackspaceBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(target).not.toBeNull();
		expect(target!.blockId).toBe(blockId);
		expect(editor.getBlock(blockId)!.type).toBe("paragraph");

		editor.destroy();
	});

	it("empty blockquote Backspace converts to paragraph at document start", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "blockquote" } },
		]);

		const target = applyBackspaceBehavior(editor, {
			blockId,
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(target).not.toBeNull();
		expect(target!.blockId).toBe(blockId);
		expect(editor.getBlock(blockId)!.type).toBe("paragraph");

		editor.destroy();
	});

	it("empty childless toggle Backspace deletes the block and moves to previous", () => {
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

		const target = applyBackspaceBehavior(editor, {
			blockId: toggleBlockId,
			ytext: getYText(editor, toggleBlockId),
			range: { start: 0, end: 0 },
		});

		expect(target).not.toBeNull();
		expect(target!.blockId).toBe(firstBlockId);
		expect(editor.getBlock(toggleBlockId)).toBeNull();
		expect(editor.blockCount()).toBe(1);

		editor.destroy();
	});

});
