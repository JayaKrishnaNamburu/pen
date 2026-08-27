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

describe("applyEnterBehavior – integration", () => {
	it("heading Enter produces a paragraph block", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "set-props",
				blockId,
				props: { type: "heading", level: 2 },
			},
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Section" },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "richtext",
			ytext: getYText(editor, blockId),
			range: { start: 7, end: 7 },
		});

		expect(target).not.toBeNull();
		expect(editor.blockCount()).toBe(2);
		expect(editor.getBlock(blockId)!.type).toBe("heading");
		expect(editor.getBlock(target!.blockId)!.type).toBe("paragraph");

		editor.destroy();
	});

	it("empty bulletListItem Enter converts to paragraph (no new block)", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "bulletListItem" } },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "richtext",
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(target).not.toBeNull();
		expect(editor.blockCount()).toBe(1);
		expect(target!.blockId).toBe(blockId);
		expect(editor.getBlock(blockId)!.type).toBe("paragraph");

		editor.destroy();
	});

	it("non-empty bulletListItem Enter splits (keeps list type)", () => {
		const editor = createEditor(editorOpts());
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "set-props", blockId, props: { type: "bulletListItem" } },
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "task" },
		]);

		const target = applyEnterBehavior(editor, {
			blockId,
			inputMode: "richtext",
			ytext: getYText(editor, blockId),
			range: { start: 4, end: 4 },
		});

		expect(target).not.toBeNull();
		expect(editor.blockCount()).toBe(2);
		expect(editor.getBlock(blockId)!.type).toBe("bulletListItem");
		expect(editor.getBlock(target!.blockId)!.type).toBe("bulletListItem");

		editor.destroy();
	});

	it("empty paragraph child Enter exits the toggle by clearing parentId", () => {
		const editor = createEditor(editorOpts());
		const toggleBlockId = editor.firstBlock()!.id;
		const childBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "set-props",
				blockId: toggleBlockId,
				props: { type: "toggle", ...{ open: true } },
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

		const target = applyEnterBehavior(editor, {
			blockId: childBlockId,
			inputMode: "richtext",
			ytext: getYText(editor, childBlockId),
			range: { start: 0, end: 0 },
		});

		expect(target).not.toBeNull();
		expect(target!.blockId).toBe(childBlockId);
		expect(editor.documentState.parentOf(childBlockId)).toBeNull();
		expect(editor.getBlock(childBlockId)?.type).toBe("paragraph");

		editor.destroy();
	});

	it("double enter exits a toggle after first exiting an empty list child", () => {
		const editor = createEditor(editorOpts());
		const toggleBlockId = editor.firstBlock()!.id;
		const childBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "set-props",
				blockId: toggleBlockId,
				props: { type: "toggle", ...{ open: true } },
			},
			{
				type: "insert-block",
				blockId: childBlockId,
				blockType: "bulletListItem",
				props: {},
				position: { after: toggleBlockId },
			},
			{
				type: "set-props",
				blockId: childBlockId,
				props: { parentId: toggleBlockId },
			},
		]);

		const firstTarget = applyEnterBehavior(editor, {
			blockId: childBlockId,
			inputMode: "richtext",
			ytext: getYText(editor, childBlockId),
			range: { start: 0, end: 0 },
		});

		expect(firstTarget?.blockId).toBe(childBlockId);
		expect(editor.getBlock(childBlockId)?.type).toBe("paragraph");
		expect(editor.documentState.parentOf(childBlockId)).toBe(toggleBlockId);

		const secondTarget = applyEnterBehavior(editor, {
			blockId: childBlockId,
			inputMode: "richtext",
			ytext: getYText(editor, childBlockId),
			range: { start: 0, end: 0 },
		});

		expect(secondTarget?.blockId).toBe(childBlockId);
		expect(editor.documentState.parentOf(childBlockId)).toBeNull();

		editor.destroy();
	});
});
