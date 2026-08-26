import type {
	Editor,
	Extension,
	InlineCompletionController,
} from "@input/pen-types";
import {
	aiAutocompleteControllerFacet,
	createDecorationSet,
	decorationsFacet,
	ensureInlineCompletionController,
} from "@input/pen-core";
import { AI_AUTOCOMPLETE_CONTROLLER_SLOT } from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import type {
	AutocompleteController,
	AutocompleteExtensionConfig,
} from "./types";
import { AutocompleteControllerImpl } from "./autocompleteController";

export const AI_AUTOCOMPLETE_EXTENSION_NAME = "ai-autocomplete";
const AUTOCOMPLETE_CONTROLLER_SLOT = AI_AUTOCOMPLETE_CONTROLLER_SLOT;

export function autocompleteExtension(
	config: AutocompleteExtensionConfig = {},
): Extension {
	let controller: AutocompleteControllerImpl | null = null;
	let inlineCompletion: InlineCompletionController | null = null;
	let releaseInlineCompletion: (() => void) | null = null;
	let activeEditor: Editor | null = null;

	return defineExtension({
		name: AI_AUTOCOMPLETE_EXTENSION_NAME,
		facets: [
			decorationsFacet.of(() =>
				createDecorationSet([
					...(inlineCompletion?.buildDecorations() ?? []),
				]),
			),
		],
		activateClient: async ({ editor }) => {
			activeEditor = editor;
			const inlineCompletionRegistration =
				ensureInlineCompletionController(editor);
			inlineCompletion = inlineCompletionRegistration.controller;
			releaseInlineCompletion = inlineCompletionRegistration.release;
			controller = new AutocompleteControllerImpl(editor, config, {
				inlineCompletion,
			});
			editor.internals.assignSlot(
				AUTOCOMPLETE_CONTROLLER_SLOT,
				controller,
			);
		},
		deactivateClient: async () => {
			controller?.destroy();
			activeEditor?.internals.assignSlot(
				AUTOCOMPLETE_CONTROLLER_SLOT,
				null,
			);
			releaseInlineCompletion?.();
			controller = null;
			inlineCompletion = null;
			releaseInlineCompletion = null;
			activeEditor = null;
		},
	});
}

export function getAutocompleteController(
	editor: Editor,
): AutocompleteController | null {
	return (
		(editor.facet(
			aiAutocompleteControllerFacet,
		) as AutocompleteController | null) ?? null
	);
}
