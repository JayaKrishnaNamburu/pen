import { describe, expect, it } from "vitest";
import {
	createEditor,
	getInlineCompletionController,
	keymapFacet,
} from "@input/pen-core";
import { getSearchController, searchExtension } from "@input/pen-search";
import {
	AI_AUTOCOMPLETE_CONTROLLER_SLOT,
	FIELD_EDITOR_SLOT_KEY,
} from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import { aiExtension } from "@input/pen-ai";
import { defaultPreset } from "@input/pen-preset-default";
import {
	handleEditorKeyBindings,
	handleFieldEditorKeyDown,
} from "@input/pen-dom/field-editor/keyHandling";
import { resolveShiftClickInlineAtomSelection } from "@input/pen-dom";
import type { FieldEditorTextLike } from "@input/pen-dom/field-editor/crdt";
import { defaultSchema } from "@input/pen-schema-default";

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
			selectAllBehavior: "block-first" as const,
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
		schema: defaultSchema,
		preset: defaultPreset(options.preset),
		extensions: options.extensions,
	});
}

describe("@input/pen-react key binding contexts", () => {
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
					facets: [
						keymapFacet.of([
							{
								key: "Ctrl-b",
								context: { collapsed: true },
								handler: () => {
									handled += 1;
									return true;
								},
							},
						]),
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
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
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
					facets: [
						keymapFacet.of([
							{
								key: "Tab",
								context: { blockType: ["codeBlock"] },
								handler: () => {
									handled += 1;
									return true;
								},
							},
						]),
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
			{ type: "set-props", blockId, props: { type: "codeBlock" } },
		]);
		editor.selectText(blockId, 0, 0);
		expect(handleEditorKeyBindings(editor, createKeyEvent("Tab"))).toBe(
			true,
		);
		expect(handled).toBe(1);

		editor.destroy();
	});

	it("maps select-all shortcuts through the T1 ladder", () => {
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
		editor.selectText(firstBlockId, 2, 2);

		expect(
			handleEditorKeyBindings(
				editor,
				createKeyEvent("a", { metaKey: true }),
			),
		).toBe(true);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: firstBlockId, offset: 5 },
		});

		expect(
			handleEditorKeyBindings(
				editor,
				createKeyEvent("a", { metaKey: true }),
			),
		).toBe(true);
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: [firstBlockId, secondBlockId],
			head: secondBlockId,
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
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
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
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
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
