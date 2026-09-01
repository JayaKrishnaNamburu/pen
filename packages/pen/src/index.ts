import {
	deltaStreamExtension,
	smoothStreamExtension,
} from "@input/pen-ai/stream";
import type {
	DeltaStreamOptions,
	SmoothStreamOptions,
} from "@input/pen-ai/stream";
import {
	createEditor as createBareEditor,
	createHeadlessEditor as createBareHeadlessEditor,
} from "@input/pen-core";
import { toolsExtension } from "@input/pen-tools";
import { createDefaultSchema } from "@input/pen-schema";
import {
	richTextShortcutsExtension,
	type RichTextShortcutsOptions,
} from "@input/pen-shortcuts";
import type {
	CreateEditorOptions,
	Editor,
	EditorPreset,
	Extension,
} from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";
import { htmlClipboardExtension } from "./htmlClipboard";

/** The editor contract types the starter constructors accept and return. */
export type { CreateEditorOptions, Editor } from "@input/pen-types";

/**
 * Core's `createEditor` with batteries: an omitted `preset` defaults to
 * {@link defaultPreset}. Explicit `preset`, `schema`, and `extensions` pass
 * through unchanged; for a bare editor use `@input/pen-core` directly.
 */
export function createEditor(options: CreateEditorOptions = {}): Editor {
	return createBareEditor({
		...options,
		preset: options.preset ?? defaultPreset(),
	});
}

/**
 * Core's `createHeadlessEditor` with the same batteries default, so a server,
 * worker, or test editor behaves like the rendered one.
 */
export function createHeadlessEditor(
	options: CreateEditorOptions = {},
): Editor {
	return createBareHeadlessEditor({
		...options,
		preset: options.preset ?? defaultPreset(),
	});
}

/** Switches for the extensions {@link defaultPreset} assembles. Each battery defaults on unless set to `false`; `smoothStream` is opt-in. */
export interface DefaultPresetOptions {
	tools?: boolean;
	deltaStream?: boolean | DeltaStreamOptions;
	/** Opt-in paced paint of streamed text. Default off. */
	smoothStream?: boolean | SmoothStreamOptions;
	undo?: boolean;
	shortcuts?: boolean | RichTextShortcutsOptions;
	htmlClipboard?: boolean;
}

/** The batteries-included preset: the default schema plus document tools, delta stream, undo, rich-text shortcuts, and HTML clipboard. */
export function defaultPreset(
	options: DefaultPresetOptions = {},
): EditorPreset {
	return {
		resolve() {
			const extensions: Extension[] = [];

			if (options.tools !== false) {
				extensions.push(toolsExtension());
			}

			if (options.deltaStream !== false) {
				extensions.push(
					deltaStreamExtension(
						resolveDeltaStreamOptions(options.deltaStream),
					),
				);
			}

			if (options.smoothStream) {
				extensions.push(
					smoothStreamExtension(
						resolveSmoothStreamOptions(options.smoothStream),
					),
				);
			}

			if (options.undo !== false) {
				extensions.push(undoExtension());
			}

			const shortcutsOptions = resolveShortcutsOptions(options.shortcuts);
			if (shortcutsOptions) {
				extensions.push(richTextShortcutsExtension(shortcutsOptions));
			}

			if (options.htmlClipboard !== false) {
				extensions.push(htmlClipboardExtension());
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

function resolveSmoothStreamOptions(
	smoothStream: DefaultPresetOptions["smoothStream"],
): SmoothStreamOptions | undefined {
	if (
		smoothStream === false ||
		smoothStream == null ||
		smoothStream === true
	) {
		return undefined;
	}

	return smoothStream;
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
