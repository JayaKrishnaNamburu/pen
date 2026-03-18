import type { Editor, Extension, KeyBinding } from "@pen/types";
import { defineExtension, SEARCH_CONTROLLER_SLOT } from "@pen/types";
import { createDecorationSet } from "@pen/core";
import { SearchControllerImpl } from "./controller";
import { buildSearchDecorations } from "./decorations";
import type { SearchController } from "./types";

export const SEARCH_EXTENSION_NAME = "search";
export { SEARCH_CONTROLLER_SLOT };

const SEARCH_KEY_BINDINGS: KeyBinding[] = [
	{
		key: "Mod-f",
		description: "Open search",
		handler: (editor, event) => {
			const controller = getSearchController(editor);
			if (!controller) {
				return false;
			}
			event.preventDefault();
			controller.open();
			return true;
		},
	},
	{
		key: "Mod-g",
		description: "Next search match",
		handler: (editor, event) => {
			const controller = getSearchController(editor);
			const state = controller?.getState();
			if (!controller || !state?.open || state.query.length === 0) {
				return false;
			}
			event.preventDefault();
			controller.next();
			return true;
		},
	},
	{
		key: "Shift-Mod-g",
		description: "Previous search match",
		handler: (editor, event) => {
			const controller = getSearchController(editor);
			const state = controller?.getState();
			if (!controller || !state?.open || state.query.length === 0) {
				return false;
			}
			event.preventDefault();
			controller.previous();
			return true;
		},
	},
	{
		key: "Enter",
		description: "Next search match",
		handler: (editor, event) => {
			const controller = getSearchController(editor);
			const state = controller?.getState();
			if (!controller || !state?.open || state.query.length === 0) {
				return false;
			}
			event.preventDefault();
			controller.next();
			return true;
		},
	},
	{
		key: "Shift-Enter",
		description: "Previous search match",
		handler: (editor, event) => {
			const controller = getSearchController(editor);
			const state = controller?.getState();
			if (!controller || !state?.open || state.query.length === 0) {
				return false;
			}
			event.preventDefault();
			controller.previous();
			return true;
		},
	},
	{
		key: "Escape",
		description: "Close search",
		handler: (editor, event) => {
			const controller = getSearchController(editor);
			const state = controller?.getState();
			if (!controller || !state?.open) {
				return false;
			}
			event.preventDefault();
			controller.close();
			return true;
		},
	},
];

export function searchExtension(): Extension {
	let activeEditor: Editor | null = null;
	let controller: SearchControllerImpl | null = null;
	let unsubscribeCommit: (() => void) | null = null;
	let unsubscribeController: (() => void) | null = null;

	return defineExtension({
		name: SEARCH_EXTENSION_NAME,
		keyBindings: SEARCH_KEY_BINDINGS,

		activateClient: async ({ editor }) => {
			activeEditor = editor;
			controller = new SearchControllerImpl(editor);
			editor.internals.setSlot(SEARCH_CONTROLLER_SLOT, controller);

			unsubscribeCommit = editor.onDocumentCommit(() => {
				controller?.recompute();
			});

			unsubscribeController = controller.subscribe(() => {
				activeEditor?.requestDecorationUpdate();
			});
		},

		deactivateClient: async () => {
			unsubscribeCommit?.();
			unsubscribeCommit = null;
			unsubscribeController?.();
			unsubscribeController = null;
			activeEditor?.internals.setSlot(SEARCH_CONTROLLER_SLOT, null);
			controller = null;
			activeEditor = null;
		},

		decorations: () => {
			const state = controller?.getState();
			if (!state || state.matches.length === 0) {
				return createDecorationSet([]);
			}
			return createDecorationSet(buildSearchDecorations(state));
		},
	});
}

export function getSearchController(editor: Editor): SearchController | null {
	return (
		editor.internals.getSlot<SearchController>(SEARCH_CONTROLLER_SLOT) ?? null
	);
}
