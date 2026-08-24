import { describe, expect, it } from "vitest";
import { createEditor, createHeadlessEditor, keymapFacet } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import {
	expandFieldEditorRange,
	contractFieldEditorRange,
	shouldUseBlockSelection,
	getExpandedBlockRole,
	computeTextDiff,
} from "@input/pen-dom/field-editor";
import { ContentEditableBackend } from "@input/pen-dom/field-editor/contenteditableBackend";
import { EditContextBackend } from "@input/pen-dom/field-editor/editContextBackend";
import { ExpandedContentEditableBackend } from "@input/pen-dom/field-editor/expandedContentEditableBackend";
import { FieldEditorImpl } from "@input/pen-dom";
import { defaultSchema } from "@input/pen-schema-default";
import {
	EditorRegionSelector,
	Pen,
	richTextShortcutsExtension,
} from "../index";

function createFieldEditorExportsEditor() {
	return createEditor({
		schema: defaultSchema, preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

describe("@input/pen-react field-editor exports", () => {
	it("loads the field-editor helper barrel on all platforms", () => {
		expect(typeof expandFieldEditorRange).toBe("function");
		expect(typeof contractFieldEditorRange).toBe("function");
		expect(typeof shouldUseBlockSelection).toBe("function");
		expect(typeof getExpandedBlockRole).toBe("function");
	});

	it("keeps concrete field-editor runtime pieces internal to source imports", () => {
		expect(typeof FieldEditorImpl).toBe("function");
		expect(typeof EditContextBackend).toBe("function");
		expect(typeof ContentEditableBackend).toBe("function");
		expect(typeof ExpandedContentEditableBackend).toBe("function");
	});

	it("computes a minimal text diff", () => {
		expect(computeTextDiff("Hello", "Hello world")).toEqual([
			{ type: "insert", offset: 5, text: " world" },
		]);
	});

	it("exports the rich-text shortcuts extension", () => {
		const extension = richTextShortcutsExtension();
		expect(extension.name).toBe("rich-text-shortcuts");
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			extensions: [extension],
		});
		expect(editor.facet(keymapFacet).map((binding) => binding.key)).toEqual([
			"Mod-b",
			"Mod-i",
			"Mod-u",
		]);
		editor.destroy();
	});

	it("exports the optional region selector primitive", () => {
		expect(typeof EditorRegionSelector).toBe("function");
		expect(Pen.Editor.RegionSelector).toBe(EditorRegionSelector);
	});

	it("exposes a stable field-editor snapshot store", () => {
		const editor = createFieldEditorExportsEditor();
		const fieldEditor = new FieldEditorImpl(editor);
		const blockId = editor.firstBlock()!.id;
		const snapshots = [fieldEditor.getSnapshot()];
		const unsubscribe = fieldEditor.subscribe(() => {
			snapshots.push(fieldEditor.getSnapshot());
		});

		fieldEditor.activate(blockId);
		fieldEditor.setFocused(true);
		fieldEditor.setTextSelection(blockId, 0, 0);
		fieldEditor.deactivate();

		expect(snapshots[0]).toEqual({
			focusBlockId: null,
			activeBlockIds: [],
			isEditing: false,
			isFocused: false,
			isComposing: false,
			domSyncVersion: 0,
			inputMode: "none",
			mode: "inactive",
			activeCellCoord: null,
		});
		expect(snapshots).toContainEqual({
			focusBlockId: blockId,
			activeBlockIds: [blockId],
			isEditing: true,
			isFocused: false,
			isComposing: false,
			domSyncVersion: 0,
			inputMode: "richtext",
			mode: "single",
			activeCellCoord: null,
		});
		expect(snapshots).toContainEqual({
			focusBlockId: blockId,
			activeBlockIds: [blockId],
			isEditing: true,
			isFocused: true,
			isComposing: false,
			domSyncVersion: 0,
			inputMode: "richtext",
			mode: "single",
			activeCellCoord: null,
		});
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 0 },
		});
		expect(fieldEditor.getSnapshot()).toEqual({
			focusBlockId: null,
			activeBlockIds: [],
			isEditing: false,
			isFocused: true,
			isComposing: false,
			domSyncVersion: 0,
			inputMode: "none",
			mode: "inactive",
			activeCellCoord: null,
		});

		unsubscribe();
		fieldEditor.destroy();
		editor.destroy();
	});

	it("derives expanded surface state from canonical multi-block selection", () => {
		const editor = createFieldEditorExportsEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "Hello",
			},
			{
				type: "splice-text",
				blockId: secondBlockId,
				from: 0,
				to: 0,
				insert: "World",
			},
		]);

		const fieldEditor = new FieldEditorImpl(editor);
		fieldEditor.activate(firstBlockId);
		fieldEditor.expandTo(secondBlockId);

		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			activeBlockIds: [firstBlockId, secondBlockId],
			isEditing: true,
			mode: "expanded",
		});
		expect(getExpandedBlockRole(editor, firstBlockId)).toBe(
			"editable-inline",
		);

		fieldEditor.destroy();
		editor.destroy();
	});

	it("switches large cross-block selections to block mode after 50 blocks", () => {
		const editor = createFieldEditorExportsEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const additionalBlockIds = Array.from({ length: 50 }, () =>
			crypto.randomUUID(),
		);
		const insertOps = additionalBlockIds.flatMap((blockId) => [
			{
				type: "insert-block" as const,
				blockId,
				blockType: "paragraph" as const,
				props: {},
				position: "last" as const,
			},
			{
				type: "splice-text" as const,
				blockId,
				from: 0,
				to: 0,
				insert: blockId,
			},
		]);

		editor.apply([
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "first",
			},
			...insertOps,
		]);

		const fieldEditor = new FieldEditorImpl(editor);
		const lastBlockId = additionalBlockIds[additionalBlockIds.length - 1]!;
		fieldEditor.activate(firstBlockId);
		fieldEditor.expandTo(lastBlockId);

		expect(shouldUseBlockSelection(editor, 51)).toBe(true);
		expect(editor.selection?.type).toBe("text");
		expect(fieldEditor.getSnapshot()).toMatchObject({
			focusBlockId: firstBlockId,
			isEditing: true,
			mode: "block",
		});
		expect(fieldEditor.getSnapshot().activeBlockIds).toHaveLength(51);

		fieldEditor.destroy();
		editor.destroy();
	});
});
