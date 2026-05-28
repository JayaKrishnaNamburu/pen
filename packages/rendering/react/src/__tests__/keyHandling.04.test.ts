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

describe("@pen/react inline atom shift-click selection", () => {
	it("extends a selected atom range to the clicked atom on the right", () => {
		const editor = createPresetEditor({ preset: { shortcuts: false } });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "xxx" },
		]);
		editor.selectText(blockId, 0, 1);

		expect(
			resolveShiftClickInlineAtomSelection(editor, blockId, 1),
		).toEqual({
			blockId,
			anchorOffset: 0,
			focusOffset: 2,
		});

		editor.destroy();
	});

	it("extends a selected atom range to the clicked atom on the left", () => {
		const editor = createPresetEditor({ preset: { shortcuts: false } });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "xxx" },
		]);
		editor.selectText(blockId, 1, 2);

		expect(
			resolveShiftClickInlineAtomSelection(editor, blockId, 0),
		).toEqual({
			blockId,
			anchorOffset: 2,
			focusOffset: 0,
		});

		editor.destroy();
	});

	it("deselects the right edge atom when shift-clicking it again", () => {
		const editor = createPresetEditor({ preset: { shortcuts: false } });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "xxx" },
		]);
		editor.selectText(blockId, 0, 2);

		expect(
			resolveShiftClickInlineAtomSelection(editor, blockId, 1),
		).toEqual({
			blockId,
			anchorOffset: 0,
			focusOffset: 1,
		});

		editor.destroy();
	});

	it("deselects the left edge atom when shift-clicking it again", () => {
		const editor = createPresetEditor({ preset: { shortcuts: false } });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "xxx" },
		]);
		editor.selectText(blockId, 0, 2);

		expect(
			resolveShiftClickInlineAtomSelection(editor, blockId, 0),
		).toEqual({
			blockId,
			anchorOffset: 2,
			focusOffset: 1,
		});

		editor.destroy();
	});

});
