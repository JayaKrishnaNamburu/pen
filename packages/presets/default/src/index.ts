import { deltaStreamExtension } from "@input/pen-delta-stream";
import type { DeltaStreamOptions } from "@input/pen-delta-stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { createDefaultSchema } from "@input/pen-schema-default";
import {
	richTextShortcutsExtension,
	type RichTextShortcutsOptions,
} from "@input/pen-shortcuts";
import type { EditorPreset, Extension } from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";

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

			return {
				schema: createDefaultSchema(),
				extensions,
			};
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
