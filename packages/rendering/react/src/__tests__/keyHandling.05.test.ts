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

describe("@pen/react field editor Tab handling", () => {
	it("handles Tab for list nesting and preserves selection", () => {
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
				type: "convert-block",
				blockId: firstBlockId,
				newType: "bulletListItem",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "bulletListItem",
				props: { indent: 0 },
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "child",
			},
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

	it("triggers explicit autocomplete when no inline suggestion is visible", () => {
		let requestCount = 0;
		let activeEditor: ReturnType<typeof createEditor> | null = null;
		const editor = createPresetEditor({
			preset: {
				shortcuts: false,
			},
			extensions: [
				defineExtension({
					name: "test-autocomplete-slot",
					activateClient: async ({ editor: nextEditor }) => {
						activeEditor = nextEditor;
						nextEditor.internals.setSlot(
							AI_AUTOCOMPLETE_CONTROLLER_SLOT,
							{
								getState: () => ({
									enabled: true,
									status: "idle",
									activeRequestId: null,
									visibleSuggestionId: null,
									settings: {
										debounceMs: 0,
										prefetchAfterAccept: false,
										acceptanceStrategy: "full" as const,
										staleAfterMs: 0,
									},
									metrics: {
										requestCount: 0,
										successCount: 0,
										cancelCount: 0,
										staleDropCount: 0,
										explicitTabTriggerCount: 0,
										acceptCount: 0,
										policyInvalidationScheduledCount: 0,
										policyInvalidationRequestingCount: 0,
										policyInvalidationShowingCount: 0,
									},
									providerTimings: [],
									diagnostics: {
										lastDismissReason: null,
										lastBlockedReason: null,
										lastPolicyInvalidationStage: null,
									},
								}),
								subscribe: () => () => {},
								request: (options?: { explicit?: boolean }) => {
									requestCount += 1;
									return options?.explicit === true;
								},
								acceptVisibleSuggestion: () => false,
								hasVisibleSuggestion: () => false,
								registerProvider: () => () => {},
								listProviderDescriptors: () => [],
								updateRuntimeSettings: () => {},
								dismiss: () => {},
								setEnabled: () => {},
							},
						);
					},
					deactivateClient: async () => {
						activeEditor?.internals.setSlot(
							AI_AUTOCOMPLETE_CONTROLLER_SLOT,
							null,
						);
						activeEditor = null;
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "root" },
		]);

		const fieldEditor = createFieldEditorMock(blockId);
		let prevented = false;
		const event = {
			...createKeyEvent("Tab"),
			preventDefault() {
				prevented = true;
			},
		} as KeyboardEvent;
		const handled = handleFieldEditorKeyDown({
			event,
			editor,
			fieldEditor: fieldEditor.controller,
			ytext: getYText(editor, blockId),
			range: { start: 4, end: 4 },
		});

		expect(handled).toBe(true);
		expect(requestCount).toBe(1);
		expect(prevented).toBe(true);

		editor.destroy();
	});

	it("delegates visible autocomplete suggestions to segmented acceptance", () => {
		let acceptVisibleSuggestionCount = 0;
		let activeEditor: ReturnType<typeof createEditor> | null = null;
		const editor = createPresetEditor({
			preset: {
				shortcuts: false,
			},
			extensions: [
				aiExtension(),
				defineExtension({
					name: "test-field-editor-slot",
					activateClient: async ({ editor: nextEditor }) => {
						activeEditor = nextEditor;
						nextEditor.internals.setSlot(FIELD_EDITOR_SLOT_KEY, {
							focusBlockId: null,
							isEditing: true,
							isFocused: true,
							isComposing: false,
						});
						nextEditor.internals.setSlot(
							AI_AUTOCOMPLETE_CONTROLLER_SLOT,
							{
								getState: () => ({
									enabled: true,
									status: "showing",
									activeRequestId: "request-1",
									visibleSuggestionId: "suggestion-1",
									settings: {
										debounceMs: 0,
										prefetchAfterAccept: false,
										acceptanceStrategy: "full" as const,
										staleAfterMs: 0,
									},
									metrics: {
										requestCount: 0,
										successCount: 0,
										cancelCount: 0,
										staleDropCount: 0,
										explicitTabTriggerCount: 0,
										acceptCount: 0,
										policyInvalidationScheduledCount: 0,
										policyInvalidationRequestingCount: 0,
										policyInvalidationShowingCount: 0,
									},
									providerTimings: [],
									diagnostics: {
										lastDismissReason: null,
										lastBlockedReason: null,
										lastPolicyInvalidationStage: null,
									},
								}),
								subscribe: () => () => {},
								request: () => false,
								acceptVisibleSuggestion: () => {
									acceptVisibleSuggestionCount += 1;
									return true;
								},
								hasVisibleSuggestion: () => true,
								registerProvider: () => () => {},
								listProviderDescriptors: () => [],
								updateRuntimeSettings: () => {},
								dismiss: () => {},
								setEnabled: () => {},
							},
						);
					},
					deactivateClient: async () => {
						activeEditor?.internals.setSlot(
							FIELD_EDITOR_SLOT_KEY,
							null,
						);
						activeEditor?.internals.setSlot(
							AI_AUTOCOMPLETE_CONTROLLER_SLOT,
							null,
						);
						activeEditor = null;
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		const fieldEditor = createFieldEditorMock(blockId);
		const inlineCompletion = getInlineCompletionController(editor);
		inlineCompletion?.showSuggestion({
			id: "suggestion-1",
			blockId,
			offset: 0,
			text: "ghost",
			type: "inline",
		});

		let prevented = false;
		const event = {
			...createKeyEvent("Tab"),
			preventDefault() {
				prevented = true;
			},
		} as KeyboardEvent;
		const handled = handleFieldEditorKeyDown({
			event,
			editor,
			fieldEditor: fieldEditor.controller,
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(handled).toBe(true);
		expect(acceptVisibleSuggestionCount).toBe(1);
		expect(prevented).toBe(true);

		editor.destroy();
	});


});
