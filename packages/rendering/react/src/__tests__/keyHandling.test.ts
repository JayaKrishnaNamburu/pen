import { describe, expect, it } from "vitest";
import { createEditor, defineExtension } from "@pen/core";
import {
	handleEditorKeyBindings,
	handleFieldEditorKeyDown,
} from "../field-editor/keyHandling";
import type { FieldEditorTextLike } from "../field-editor/crdt";

type BlocksMapLike = {
	get(key: string): { get(field: string): unknown } | undefined;
};

type RawDocLike = {
	getMap(name: string): BlocksMapLike;
};

function createKeyEvent(
	key: string,
	options: Partial<KeyboardEvent> = {},
): KeyboardEvent {
	return {
		key,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		...options,
	} as KeyboardEvent;
}

function withNavigatorPlatform<T>(platform: string, run: () => T): T {
	const descriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
	Object.defineProperty(navigator, "platform", {
		configurable: true,
		value: platform,
	});
	try {
		return run();
	} finally {
		if (descriptor) {
			Object.defineProperty(navigator, "platform", descriptor);
		}
	}
}

function getYText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): FieldEditorTextLike {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw<RawDocLike>(doc);
	const ytext = ydoc.getMap("blocks").get(blockId)?.get("content") as
		| FieldEditorTextLike
		| null;
	if (!ytext) {
		throw new Error(`Missing test Y.Text for block ${blockId}`);
	}
	return ytext;
}

function createFieldEditorMock(blockId: string) {
	const activations: Array<{
		blockId: string;
		anchorOffset: number;
		focusOffset: number;
	}> = [];

	return {
		controller: {
			focusBlockId: blockId,
			inputMode: "richtext" as const,
			activeCellCoord: null,
			activateCell: () => {},
			activateTextSelection: (
				targetBlockId: string,
				anchorOffset: number,
				focusOffset: number,
			) => {
				activations.push({
					blockId: targetBlockId,
					anchorOffset,
					focusOffset,
				});
			},
			deactivate: () => {},
			selectAll: () => false,
		},
		activations,
	};
}

describe("@pen/react key binding contexts", () => {
	it("filters bindings by collapsed selection state", () => {
		let handled = 0;
		const editor = createEditor({
			without: [
				"document-ops",
				"delta-stream",
				"undo",
				"rich-text-shortcuts",
			],
			extensions: [
				defineExtension({
					name: "collapsed-only",
					keyBindings: [
						{
							key: "Ctrl-b",
							context: { collapsed: true },
							handler: () => {
								handled += 1;
								return true;
							},
						},
					],
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;

		editor.selectText(blockId, 0, 0);
		expect(
			handleEditorKeyBindings(
				editor,
				createKeyEvent("b", { ctrlKey: true }),
			),
		).toBe(true);

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 0, 5);
		expect(
			handleEditorKeyBindings(
				editor,
				createKeyEvent("b", { ctrlKey: true }),
			),
		).toBe(false);
		expect(handled).toBe(1);

		editor.destroy();
	});

	it("filters bindings by active block type", () => {
		let handled = 0;
		const editor = createEditor({
			without: [
				"document-ops",
				"delta-stream",
				"undo",
				"rich-text-shortcuts",
			],
			extensions: [
				defineExtension({
					name: "code-only",
					keyBindings: [
						{
							key: "Tab",
							context: { blockType: ["codeBlock"] },
							handler: () => {
								handled += 1;
								return true;
							},
						},
					],
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;

		editor.selectText(blockId, 0, 0);
		expect(handleEditorKeyBindings(editor, createKeyEvent("Tab"))).toBe(
			false,
		);

		editor.apply([
			{ type: "convert-block", blockId, newType: "codeBlock" },
		]);
		editor.selectText(blockId, 0, 0);
		expect(handleEditorKeyBindings(editor, createKeyEvent("Tab"))).toBe(
			true,
		);
		expect(handled).toBe(1);

		editor.destroy();
	});

	it("maps select-all shortcuts to full-document text selection", () => {
		const editor = createEditor({
			without: [
				"document-ops",
				"delta-stream",
				"undo",
				"rich-text-shortcuts",
			],
		});
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
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "World",
			},
		]);

		expect(
			handleEditorKeyBindings(
				editor,
				createKeyEvent("a", { metaKey: true }),
			),
		).toBe(true);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: secondBlockId, offset: 5 },
			isMultiBlock: true,
		});

		editor.destroy();
	});

	it("matches Mod-* bindings on macOS using Meta", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 0, 5);

		withNavigatorPlatform("MacIntel", () => {
			expect(
				handleEditorKeyBindings(
					editor,
					createKeyEvent("b", { metaKey: true }),
				),
			).toBe(true);
		});

		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{
				insert: "Hello",
				attributes: { bold: true },
			},
		]);

		editor.destroy();
	});

	it("matches Mod-* bindings on non-mac platforms using Ctrl", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 0, 5);

		withNavigatorPlatform("Win32", () => {
			expect(
				handleEditorKeyBindings(
					editor,
					createKeyEvent("b", { ctrlKey: true }),
				),
			).toBe(true);
		});

		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{
				insert: "Hello",
				attributes: { bold: true },
			},
		]);

		editor.destroy();
	});

	it("handles macOS undo and redo shortcuts without native history events", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "rich-text-shortcuts"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 5, 5);

		withNavigatorPlatform("MacIntel", () => {
			expect(
				handleEditorKeyBindings(
					editor,
					createKeyEvent("z", { metaKey: true }),
				),
			).toBe(true);
			expect(editor.getBlock(blockId)?.textContent()).toBe("");

			expect(
				handleEditorKeyBindings(
					editor,
					createKeyEvent("z", { metaKey: true, shiftKey: true }),
				),
			).toBe(true);
			expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
		});

		editor.destroy();
	});
});

describe("@pen/react field editor Tab handling", () => {
	it("handles Tab for list nesting and preserves selection", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo", "rich-text-shortcuts"],
		});
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{ type: "convert-block", blockId: firstBlockId, newType: "bulletListItem" },
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "bulletListItem",
				props: { indent: 0 },
				position: { after: firstBlockId },
			},
			{ type: "insert-text", blockId: secondBlockId, offset: 0, text: "child" },
		]);

		const fieldEditor = createFieldEditorMock(secondBlockId);
		const handled = handleFieldEditorKeyDown({
			event: createKeyEvent("Tab"),
			editor,
			fieldEditor: fieldEditor.controller,
			ytext: getYText(editor, secondBlockId),
			range: { start: 2, end: 2 },
		});

		expect(handled).toBe(true);
		expect(editor.getBlock(secondBlockId)?.props.indent).toBe(1);
		expect(fieldEditor.activations).toEqual([
			{ blockId: secondBlockId, anchorOffset: 2, focusOffset: 2 },
		]);

		editor.destroy();
	});

	it("does not handle Tab when a top-level list item cannot nest deeper", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo", "rich-text-shortcuts"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "bulletListItem" },
			{ type: "insert-text", blockId, offset: 0, text: "root" },
		]);

		const fieldEditor = createFieldEditorMock(blockId);
		const handled = handleFieldEditorKeyDown({
			event: createKeyEvent("Tab"),
			editor,
			fieldEditor: fieldEditor.controller,
			ytext: getYText(editor, blockId),
			range: { start: 4, end: 4 },
		});

		expect(handled).toBe(false);
		expect(editor.getBlock(blockId)?.props.indent).toBe(0);
		expect(fieldEditor.activations).toEqual([]);

		editor.destroy();
	});
});
