import type { Editor, Extension } from "@input/pen-types";
import { HISTORY_CONTROLLER_SLOT } from "@input/pen-types";
import { defineExtension, historyControllerFacet } from "@input/pen-core";
import { attachHistoryScopeRuntime } from "./scopeRuntime";
import type { HistoryConfig, HistoryController } from "./types";

export const HISTORY_EXTENSION_NAME = "history";
export { HISTORY_CONTROLLER_SLOT };

export function historyExtension(config: HistoryConfig): Extension {
	let activeEditor: Editor | null = null;
	let runtimeHandle: ReturnType<typeof attachHistoryScopeRuntime> | null = null;

	return defineExtension({
		name: HISTORY_EXTENSION_NAME,

		activateClient: async ({ editor }) => {
			activeEditor = editor;
			runtimeHandle = attachHistoryScopeRuntime(editor, config);
			editor.internals.assignSlot(HISTORY_CONTROLLER_SLOT, runtimeHandle.controller);
			await runtimeHandle.ready;
		},

		deactivateClient: async () => {
			runtimeHandle?.dispose();
			runtimeHandle = null;
			activeEditor?.internals.assignSlot(HISTORY_CONTROLLER_SLOT, null);
			activeEditor = null;
		},
	});
}

export function getHistoryController(
	editor: Editor,
): HistoryController | null {
	return (
		(editor.facet(historyControllerFacet) as HistoryController | null) ?? null
	);
}
