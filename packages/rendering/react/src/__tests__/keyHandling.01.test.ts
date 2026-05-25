import { describe, expect, it } from "vitest";
import { createEditor, getInlineCompletionController } from "@pen/core";
import { getSearchController, searchExtension } from "@pen/search";
import {
	AI_AUTOCOMPLETE_CONTROLLER_SLOT,
	defineExtension,
	FIELD_EDITOR_SLOT_KEY,
} from "@pen/types";
import { aiExtension } from "@pen/ai";
import { defaultPreset } from "@pen/preset-default";
import {
	handleEditorKeyBindings,
	handleFieldEditorKeyDown,
} from "../field-editor/keyHandling";
import { resolveShiftClickInlineAtomSelection } from "../primitives/editor/inlineAtomInteraction";
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
	let defaultPrevented = false;
	return {
		key,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		defaultPrevented,
		preventDefault() {
			defaultPrevented = true;
			Object.defineProperty(this, "defaultPrevented", {
				configurable: true,
				value: true,
			});
		},
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
	const ytext = ydoc
		.getMap("blocks")
		.get(blockId)
		?.get("content") as FieldEditorTextLike | null;
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
	const programmaticSelections: Array<{
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
			commitProgrammaticTextSelection: (
				targetBlockId: string,
				anchorOffset: number,
				focusOffset: number,
			) => {
				programmaticSelections.push({
					blockId: targetBlockId,
					anchorOffset,
					focusOffset,
				});
			},
			deactivate: () => {},
			selectAll: () => false,
		},
		activations,
		programmaticSelections,
	};
}

function createPresetEditor(
	options: {
		preset?: Parameters<typeof defaultPreset>[0];
		extensions?: NonNullable<
			Parameters<typeof createEditor>[0]
		>["extensions"];
	} = {},
) {
	return createEditor({
		preset: defaultPreset(options.preset),
		extensions: options.extensions,
	});
}

describe("@pen/react key binding contexts", () => {
	it("selects inline atoms before arrow navigation moves past them", () => {
		const editor = createPresetEditor({
			preset: {
				documentOps: false,
				deltaStream: false,
				undo: false,
				shortcuts: false,
			},
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "A" },
			{
				type: "insert-inline-node",
				blockId,
				offset: 1,
				nodeType: "mention",
				props: { id: "user-1", label: "Ada" },
			},
			{ type: "insert-text", blockId, offset: 2, text: "B" },
		]);
		const ytext = getYText(editor, blockId);
		const fieldEditor = createFieldEditorMock(blockId);

		expect(
			handleFieldEditorKeyDown({
				event: createKeyEvent("ArrowLeft"),
				editor,
				fieldEditor: fieldEditor.controller,
				ytext,
				range: { start: 2, end: 2 },
			}),
		).toBe(true);
		expect(fieldEditor.activations.at(-1)).toEqual({
			blockId,
			anchorOffset: 1,
			focusOffset: 2,
		});

		expect(
			handleFieldEditorKeyDown({
				event: createKeyEvent("ArrowLeft"),
				editor,
				fieldEditor: fieldEditor.controller,
				ytext,
				range: { start: 1, end: 2 },
			}),
		).toBe(true);
		expect(fieldEditor.activations.at(-1)).toEqual({
			blockId,
			anchorOffset: 1,
			focusOffset: 1,
		});

		expect(
			handleFieldEditorKeyDown({
				event: createKeyEvent("ArrowRight"),
				editor,
				fieldEditor: fieldEditor.controller,
				ytext,
				range: { start: 1, end: 1 },
			}),
		).toBe(true);
		expect(fieldEditor.activations.at(-1)).toEqual({
			blockId,
			anchorOffset: 1,
			focusOffset: 2,
		});

		editor.destroy();
	});

	it("filters bindings by collapsed selection state", () => {
		let handled = 0;
		const editor = createPresetEditor({
			preset: {
				documentOps: false,
				deltaStream: false,
				undo: false,
				shortcuts: false,
			},
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
		const editor = createPresetEditor({
			preset: {
				documentOps: false,
				deltaStream: false,
				undo: false,
				shortcuts: false,
			},
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
		const editor = createPresetEditor({
			preset: {
				documentOps: false,
				deltaStream: false,
				undo: false,
				shortcuts: false,
			},
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
		const editor = createPresetEditor({
			preset: {
				documentOps: false,
				deltaStream: false,
				undo: false,
			},
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
		const editor = createPresetEditor({
			preset: {
				documentOps: false,
				deltaStream: false,
				undo: false,
			},
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


});
