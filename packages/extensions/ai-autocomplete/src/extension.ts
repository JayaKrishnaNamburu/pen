import type { Editor, Extension, InlineCompletionController } from "@pen/types";
import { createDecorationSet, ensureInlineCompletionController } from "@pen/core";
import { AI_AUTOCOMPLETE_CONTROLLER_SLOT, defineExtension } from "@pen/types";
import type { AutocompleteController, AutocompleteExtensionConfig } from "./types";
import { AutocompleteControllerImpl } from "./autocompleteController";

export const AI_AUTOCOMPLETE_EXTENSION_NAME = "ai-autocomplete";
export const AUTOCOMPLETE_CONTROLLER_SLOT = AI_AUTOCOMPLETE_CONTROLLER_SLOT;

export function autocompleteExtension(
	config: AutocompleteExtensionConfig = {},
): Extension {
	let controller: AutocompleteControllerImpl | null = null;
	let inlineCompletion: InlineCompletionController | null = null;
	let releaseInlineCompletion: (() => void) | null = null;
	let activeEditor: Editor | null = null;

	return defineExtension({
		name: AI_AUTOCOMPLETE_EXTENSION_NAME,
		activateClient: async ({ editor }) => {
			activeEditor = editor;
			const inlineCompletionRegistration =
				ensureInlineCompletionController(editor);
			inlineCompletion = inlineCompletionRegistration.controller;
			releaseInlineCompletion = inlineCompletionRegistration.release;
			controller = new AutocompleteControllerImpl(editor, config, {
				inlineCompletion,
			});
			editor.internals.setSlot(AUTOCOMPLETE_CONTROLLER_SLOT, controller);
		},
		deactivateClient: async () => {
			controller?.destroy();
			activeEditor?.internals.setSlot(AUTOCOMPLETE_CONTROLLER_SLOT, null);
			releaseInlineCompletion?.();
			controller = null;
			inlineCompletion = null;
			releaseInlineCompletion = null;
			activeEditor = null;
		},
		decorations: () =>
			createDecorationSet([
				...(inlineCompletion?.buildDecorations() ?? []),
			]),
	});
}

export function getAutocompleteController(
	editor: Editor,
): AutocompleteController | null {
	return (
		editor.internals.getSlot<AutocompleteController>(
			AUTOCOMPLETE_CONTROLLER_SLOT,
		) ?? null
	);
}
