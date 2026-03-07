import { describe, expect, it } from "vitest";
import { createEditor, defineExtension } from "@pen/core";
import { handleEditorKeyBindings } from "../field-editor/keyHandling.js";

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
