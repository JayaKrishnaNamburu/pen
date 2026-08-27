import { describe, expect, it } from "vitest";
import { createEditor, getInlineCompletionController } from "@input/pen-core";
import { getSearchController, searchExtension } from "@input/pen-search";
import {
	AI_AUTOCOMPLETE_CONTROLLER_SLOT,
	FIELD_EDITOR_SLOT_KEY,
} from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import { aiExtension } from "@input/pen-ai";
import { defaultPreset } from "@input/pen";
import {
	handleEditorKeyBindings,
	handleFieldEditorKeyDown,
} from "@input/pen-dom/field-editor/keyHandling";
import { resolveShiftClickInlineAtomSelection } from "@input/pen-dom";
import type { FieldEditorTextLike } from "@input/pen-dom/field-editor/crdt";
import { defaultSchema } from "@input/pen-schema";

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

describe("@input/pen-react field editor Tab handling: autocomplete commit", () => {
	it("commits programmatic selection after accepting raw inline completions", () => {
		const editor = createPresetEditor({
			preset: {
				shortcuts: false,
			},
			extensions: [aiExtension()],
		});
		const blockId = editor.firstBlock()!.id;
		const fieldEditor = createFieldEditorMock(blockId);
		const inlineCompletion = getInlineCompletionController(editor);
		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
		]);
		editor.selectText(blockId, 5, 5);
		inlineCompletion?.showSuggestion({
			id: "suggestion-1",
			blockId,
			offset: 5,
			text: " world",
			type: "inline",
		});

		const handled = handleFieldEditorKeyDown({
			event: createKeyEvent("Tab"),
			editor,
			fieldEditor: fieldEditor.controller,
			ytext: getYText(editor, blockId),
			range: { start: 5, end: 5 },
		});

		expect(handled).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello world");
		expect(fieldEditor.programmaticSelections).toEqual([
			{ blockId, anchorOffset: 11, focusOffset: 11 },
		]);

		editor.destroy();
	});

	it("dismisses visible autocomplete on typing without handling the key event", () => {
		let dismissReason: string | null = null;
		let activeEditor: ReturnType<typeof createEditor> | null = null;
		const editor = createPresetEditor({
			preset: {
				shortcuts: false,
			},
			extensions: [
				defineExtension({
					name: "test-autocomplete-dismiss-slot",
					activateClient: async ({ editor: nextEditor }) => {
						activeEditor = nextEditor;
						nextEditor.internals.assignSlot(
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
								acceptVisibleSuggestion: () => false,
								hasVisibleSuggestion: () => true,
								registerProvider: () => () => {},
								listProviderDescriptors: () => [],
								updateRuntimeSettings: () => {},
								dismiss: (reason?: string) => {
									dismissReason = reason ?? null;
								},
								setEnabled: () => {},
							},
						);
					},
					deactivateClient: async () => {
						activeEditor?.internals.assignSlot(
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

		const handled = handleFieldEditorKeyDown({
			event: createKeyEvent("a"),
			editor,
			fieldEditor: fieldEditor.controller,
			ytext: getYText(editor, blockId),
			range: { start: 0, end: 0 },
		});

		expect(handled).toBe(false);
		expect(dismissReason).toBe("typing");

		editor.destroy();
	});
});
