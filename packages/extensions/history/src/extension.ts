import type { Editor, Extension } from "@pen/types";
import {
	defineExtension,
	HISTORY_CONTROLLER_SLOT,
} from "@pen/types";
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
			editor.internals.setSlot(HISTORY_CONTROLLER_SLOT, runtimeHandle.controller);
			await runtimeHandle.ready;
		},

		deactivateClient: async () => {
			runtimeHandle?.dispose();
			runtimeHandle = null;
			activeEditor?.internals.setSlot(HISTORY_CONTROLLER_SLOT, null);
			activeEditor = null;
		},
	});
}

export function getHistoryController(
	editor: Editor,
): HistoryController | null {
	return (
		editor.internals.getSlot<HistoryController>(HISTORY_CONTROLLER_SLOT) ?? null
	);
}
