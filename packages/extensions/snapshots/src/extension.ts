import type { Editor, Extension } from "@input/pen-types";
import { SNAPSHOTS_CONTROLLER_SLOT } from "@input/pen-types";
import { defineExtension, snapshotsControllerFacet } from "@input/pen-core";
import { attachHistoryScopeRuntime } from "./scopeRuntime";
import type { SnapshotsConfig, SnapshotsController } from "./types";

/** Extension name under which document history registers. */
export const SNAPSHOTS_EXTENSION_NAME = "snapshots";

/**
 * Add snapshot history and authorship attribution to an editor. The
 * extension attaches its runtime on client activation and publishes a
 * {@link SnapshotsController} into the history slot, so hosts read it
 * through {@link getSnapshotsController} instead of holding a reference
 * across activations.
 *
 * Attribution is only as trustworthy as `config.resolveAuthor`: without
 * a resolver every range reports an opaque client handle rather than a
 * name.
 */
export function snapshotsExtension(config: SnapshotsConfig): Extension {
	let activeEditor: Editor | null = null;
	let runtimeHandle: ReturnType<typeof attachHistoryScopeRuntime> | null =
		null;

	return defineExtension({
		name: SNAPSHOTS_EXTENSION_NAME,

		activateClient: async ({ editor }) => {
			activeEditor = editor;
			runtimeHandle = attachHistoryScopeRuntime(editor, config);
			editor.internals.assignSlot(
				SNAPSHOTS_CONTROLLER_SLOT,
				runtimeHandle.controller,
			);
			await runtimeHandle.ready;
		},

		deactivateClient: async () => {
			runtimeHandle?.dispose();
			runtimeHandle = null;
			activeEditor?.internals.assignSlot(SNAPSHOTS_CONTROLLER_SLOT, null);
			activeEditor = null;
		},
	});
}

/**
 * Read the active history controller, or `null` when the history
 * extension is not installed or its client is not activated yet.
 */
export function getSnapshotsController(editor: Editor): SnapshotsController | null {
	return (
		(editor.facet(snapshotsControllerFacet) as SnapshotsController | null) ??
		null
	);
}
