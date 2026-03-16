import { deltaStreamExtension } from "@pen/delta-stream";
import type { DeltaStreamOptions } from "@pen/delta-stream";
import { documentOpsExtension } from "@pen/document-ops";
import {
	richTextShortcutsExtension,
	type RichTextShortcutsOptions,
} from "@pen/shortcuts";
import type { EditorPreset, Extension } from "@pen/types";
import { undoExtension } from "@pen/undo";

export interface DefaultPresetOptions {
	documentOps?: boolean;
	deltaStream?: boolean | DeltaStreamOptions;
	undo?: boolean;
	shortcuts?: boolean | RichTextShortcutsOptions;
}

export function defaultPreset(
	options: DefaultPresetOptions = {},
): EditorPreset {
	return {
		resolve() {
			const extensions: Extension[] = [];

			if (options.documentOps !== false) {
				extensions.push(documentOpsExtension());
			}

			if (options.deltaStream !== false) {
				extensions.push(
					deltaStreamExtension(resolveDeltaStreamOptions(options.deltaStream)),
				);
			}

			if (options.undo !== false) {
				extensions.push(undoExtension());
			}

			const shortcutsOptions = resolveShortcutsOptions(options.shortcuts);
			if (shortcutsOptions) {
				extensions.push(richTextShortcutsExtension(shortcutsOptions));
			}

			return { extensions };
		},
	};
}

function resolveDeltaStreamOptions(
	deltaStream: DefaultPresetOptions["deltaStream"],
): DeltaStreamOptions | undefined {
	if (deltaStream === false || deltaStream == null || deltaStream === true) {
		return undefined;
	}

	return deltaStream;
}

function resolveShortcutsOptions(
	shortcuts: DefaultPresetOptions["shortcuts"],
): RichTextShortcutsOptions | null {
	if (shortcuts === false) {
		return null;
	}

	if (shortcuts === true || shortcuts == null) {
		return {};
	}

	return shortcuts;
}
