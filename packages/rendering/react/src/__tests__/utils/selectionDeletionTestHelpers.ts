import {
	createEditor as createCoreEditor,
	fieldEditorHostFacet,
} from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import type { FieldEditorImpl } from "@input/pen-dom/field-editor/fieldEditorImpl";
import { defaultSchema } from "@input/pen-schema";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export const SLOW_BEFOREINPUT_TEST_TIMEOUT_MS = 60_000;

export async function flushAnimationFrames(count = 1): Promise<void> {
	for (let i = 0; i < count; i++) {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => resolve());
		});
	}
}

export function createKeyEvent(
	key: string,
	options: KeyboardEventInit = {},
): KeyboardEvent {
	return new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		...options,
	});
}

export function createSelectAllEvent(): KeyboardEvent {
	return createKeyEvent("a", {
		metaKey: true,
		cancelable: true,
	});
}

export function createEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
): ReturnType<typeof createCoreEditor> {
	if (options.preset == null && options.extensions == null) {
		return createCoreEditor({
			schema: defaultSchema,
			...options,
			preset: defaultPreset({
				tools: false,
				deltaStream: false,
				undo: false,
			}),
		});
	}

	return createCoreEditor(options);
}

export function createUndoSelectionDeletionEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
): ReturnType<typeof createCoreEditor> {
	return createCoreEditor({
		schema: defaultSchema,
		...options,
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: true,
		}),
	});
}

export function getFieldEditor(
	editor: ReturnType<typeof createEditor>,
): FieldEditorImpl {
	const fieldEditor = editor.facet(
		fieldEditorHostFacet,
	) as FieldEditorImpl | null;
	if (!fieldEditor) {
		throw new Error("Missing attached field editor");
	}
	return fieldEditor;
}

export function setNativeSelectionRange(
	startElement: HTMLElement,
	startOffset: number,
	endElement: HTMLElement,
	endOffset: number,
): void {
	const selection = document.getSelection();
	const range = document.createRange();
	range.setStart(startElement.firstChild ?? startElement, startOffset);
	range.setEnd(endElement.firstChild ?? endElement, endOffset);
	selection?.removeAllRanges();
	selection?.addRange(range);
}
