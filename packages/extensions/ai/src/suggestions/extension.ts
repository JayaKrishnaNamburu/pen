import {
	aiSuggestionsControllerFacet,
	createDecorationSet,
	decorationsFacet,
} from "@input/pen-core";
import { AI_SUGGESTIONS_CONTROLLER_SLOT } from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import type { Editor, Extension } from "@input/pen-types";
import { AISuggestionsControllerImpl } from "./controller";
import { resolveAISuggestionsConfig } from "./config";
import { buildAISuggestionDecorations } from "./decorations";
import type {
	AISuggestionsController,
	AISuggestionsExtensionConfig,
} from "./types";

export const AI_SUGGESTIONS_EXTENSION_NAME = "ai-suggestions";

export function aiSuggestionsExtension(
	config: AISuggestionsExtensionConfig = {},
): Extension {
	let activeEditor: Editor | null = null;
	let controller: AISuggestionsControllerImpl | null = null;
	let unsubscribeCommit: (() => void) | null = null;

	const resolvedConfig = resolveAISuggestionsConfig(config);

	return defineExtension({
		name: AI_SUGGESTIONS_EXTENSION_NAME,
		facets: [
			decorationsFacet.of(() => {
				const state = controller?.getState();
				if (!state || state.suggestions.length === 0) {
					return createDecorationSet([]);
				}
				return createDecorationSet(
					buildAISuggestionDecorations(
						state.suggestions,
						state.activeSuggestionId,
						state.groups,
					),
				);
			}),
		],

		activateClient: async ({ editor }) => {
			activeEditor = editor;
			controller = new AISuggestionsControllerImpl(editor, resolvedConfig);
			editor.internals.assignSlot(AI_SUGGESTIONS_CONTROLLER_SLOT, controller);

			unsubscribeCommit = editor.on("commit", (event) => {
				controller?.handleCommit(event);
			});
		},

		deactivateClient: async () => {
			unsubscribeCommit?.();
			unsubscribeCommit = null;
			activeEditor?.internals.assignSlot(AI_SUGGESTIONS_CONTROLLER_SLOT, null);
			controller?.destroy();
			controller = null;
			activeEditor = null;
		},
	});
}

export function getAISuggestionsController(
	editor: Editor,
): AISuggestionsController | null {
	return (
		(editor.facet(
			aiSuggestionsControllerFacet,
		) as AISuggestionsController | null) ?? null
	);
}
