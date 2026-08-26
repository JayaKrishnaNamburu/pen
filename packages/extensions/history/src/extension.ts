import type { Editor, Extension } from "@input/pen-types";
import { HISTORY_CONTROLLER_SLOT } from "@input/pen-types";
import { defineExtension, historyControllerFacet } from "@input/pen-core";
import { attachHistoryScopeRuntime } from "./scopeRuntime";
import type { HistoryConfig, HistoryController } from "./types";

/** Extension name under which document history registers. */
export const HISTORY_EXTENSION_NAME = "history";

/**
 * Add snapshot history and authorship attribution to an editor. The
 * extension attaches its runtime on client activation and publishes a
 * {@link HistoryController} into the history slot, so hosts read it
 * through {@link getHistoryController} instead of holding a reference
 * across activations.
 *
 * Attribution is only as trustworthy as `config.resolveAuthor`: without
 * a resolver every range reports an opaque client handle rather than a
 * name.
 */
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

/**
 * Read the active history controller, or `null` when the history
 * extension is not installed or its client is not activated yet.
 */
export function getHistoryController(
	editor: Editor,
): HistoryController | null {
	return (
		(editor.facet(historyControllerFacet) as HistoryController | null) ?? null
	);
}
