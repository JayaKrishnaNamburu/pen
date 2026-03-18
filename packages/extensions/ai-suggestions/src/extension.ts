import { createDecorationSet } from "@pen/core";
import { AI_SUGGESTIONS_CONTROLLER_SLOT } from "@pen/types";
import { defineExtension } from "@pen/types";
import type { Editor, Extension } from "@pen/types";
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

		activateClient: async ({ editor }) => {
			activeEditor = editor;
			controller = new AISuggestionsControllerImpl(editor, resolvedConfig);
			editor.internals.setSlot(AI_SUGGESTIONS_CONTROLLER_SLOT, controller);

			unsubscribeCommit = editor.onDocumentCommit((event) => {
				controller?.handleDocumentCommit(event);
			});
		},

		deactivateClient: async () => {
			unsubscribeCommit?.();
			unsubscribeCommit = null;
			activeEditor?.internals.setSlot(AI_SUGGESTIONS_CONTROLLER_SLOT, null);
			controller?.destroy();
			controller = null;
			activeEditor = null;
		},

		decorations: () => {
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
		},
	});
}

export function getAISuggestionsController(
	editor: Editor,
): AISuggestionsController | null {
	return (
		editor.internals.getSlot<AISuggestionsController>(
			AI_SUGGESTIONS_CONTROLLER_SLOT,
		) ?? null
	);
}
