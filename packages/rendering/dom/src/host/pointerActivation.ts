import { usesInlineTextSelection } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { pointToEditorSelectionPoint } from "../field-editor/selectionBridge";
import { DATA_ATTRS } from "../utils/dataAttributes";

export interface FieldEditorPointerTarget {
	getSnapshot(): {
		isEditing: boolean;
		focusBlockId: string | null;
	};
	activateTextSelection(
		blockId: string,
		anchorOffset: number,
		focusOffset: number,
	): void;
	attachElement(element: HTMLElement): void;
}

export interface FieldEditorPointerActivateOptions {
	event: MouseEvent;
	editor: Editor;
	fieldEditor: FieldEditorPointerTarget;
	root: HTMLElement;
	blocksHost: HTMLElement;
	readonly?: boolean;
}

export function handleFieldEditorPointerActivate(
	options: FieldEditorPointerActivateOptions,
): boolean {
	const { event, editor, fieldEditor, root, blocksHost, readonly } = options;
	if (readonly === true || event.button !== 0) {
		return false;
	}

	const target = resolveEventElement(event.target);
	if (!target || !blocksHost.contains(target)) {
		return false;
	}
	if (target.closest(`[${DATA_ATTRS.ignorePointerGesture}]`)) {
		return false;
	}

	const blockElement = target.closest(`[${DATA_ATTRS.editorBlock}]`);
	if (
		!(blockElement instanceof HTMLElement) ||
		!blocksHost.contains(blockElement)
	) {
		return false;
	}

	const blockId = blockElement.getAttribute(DATA_ATTRS.blockId);
	if (!blockId) {
		return false;
	}

	const block = editor.getBlock(blockId);
	const schema = block ? editor.schema.resolve(block.type) : null;
	if (!usesInlineTextSelection(schema)) {
		return false;
	}

	const snapshot = fieldEditor.getSnapshot();
	if (snapshot.isEditing && snapshot.focusBlockId === blockId) {
		return false;
	}

	event.preventDefault();
	const point = pointToEditorSelectionPoint(root, event.clientX, event.clientY);
	if (point && point.blockId === blockId) {
		fieldEditor.activateTextSelection(point.blockId, point.offset, point.offset);
	} else {
		const offset = block?.length() ?? 0;
		fieldEditor.activateTextSelection(blockId, offset, offset);
	}

	const inline =
		target.closest(`[${DATA_ATTRS.inlineContent}]`) ??
		blockElement.querySelector(`[${DATA_ATTRS.inlineContent}]`);
	if (inline instanceof HTMLElement) {
		fieldEditor.attachElement(inline);
	}
	return true;
}

function resolveEventElement(target: EventTarget | null): Element | null {
	if (target instanceof Element) {
		return target;
	}
	if (target instanceof Node) {
		return target.parentElement;
	}
	return null;
}
