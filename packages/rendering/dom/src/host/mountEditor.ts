import {
	readOnlyFacet,
	resolveEditorA11yLabel,
} from "@input/pen-core";
import {
	FIELD_EDITOR_SLOT_KEY,
	type Editor,
	type InteractionModel,
	type Unsubscribe,
} from "@input/pen-types";
import { resolveSelectAllBehavior } from "../constants/selectAll";
import type { PenFocusPolicy } from "../field-editor/controller";
import { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import {
	domSelectionToEditor,
	pointToEditorSelectionPoint,
} from "../field-editor/selectionBridge";
import { handleEditorDocumentKeyDown } from "../utils/documentShortcuts";
import { DATA_ATTRS } from "../utils/dataAttributes";
import { computeDocumentEmpty } from "../utils/editorEmptyState";
import { shouldHandleEditorKeyboardEvent } from "../utils/textEntryTarget";
import { createDocumentTree } from "./documentTree";

export interface MountEditorOptions {
	readonly?: boolean;
	interactionModel?: InteractionModel;
	focusPolicy?: PenFocusPolicy;
}

export interface MountedEditor {
	readonly fieldEditor: FieldEditorImpl;
	readonly root: HTMLElement;
	destroy(): void;
}

export function mountEditor(
	editor: Editor,
	root: HTMLElement,
	options: MountEditorOptions = {},
): MountedEditor {
	const readonly = options.readonly === true;
	const interactionModel = options.interactionModel ?? "content-first";
	const fieldEditor = new FieldEditorImpl(editor, {
		selectAllBehavior: resolveSelectAllBehavior(interactionModel),
		focusPolicy: options.focusPolicy,
	});

	editor.internals.assignSlot(FIELD_EDITOR_SLOT_KEY, fieldEditor);
	applyEditorRootAttrs(root, editor, {
		readonly,
		focused: false,
	});

	const tree = createDocumentTree(editor, fieldEditor, root);
	fieldEditor.setRootElement(root);

	const unsubscribers: Unsubscribe[] = [];

	const handleFocusIn = (): void => {
		fieldEditor.setFocused(true);
		applyEditorRootAttrs(root, editor, {
			readonly,
			focused: true,
		});
	};

	const handleFocusOut = (): void => {
		const activeElement = root.ownerDocument?.activeElement;
		const nextFocused =
			activeElement instanceof Node && root.contains(activeElement);
		fieldEditor.setFocused(nextFocused);
		applyEditorRootAttrs(root, editor, {
			readonly,
			focused: nextFocused,
		});
	};

	const handleDocumentKeyDown = (event: KeyboardEvent): void => {
		const shouldHandle = shouldHandleEditorKeyboardEvent({
			root,
			event,
			selection: editor.selection,
			hasMappedDomSelection: () => domSelectionToEditor(root) !== null,
		});
		if (!shouldHandle) {
			return;
		}
		if (
			handleEditorDocumentKeyDown({
				event,
				editor,
				fieldEditor,
				interactionModel,
				root,
			})
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};

	const handlePointerActivate = (event: MouseEvent): void => {
		if (readonly || event.button !== 0) {
			return;
		}
		const target = resolveEventElement(event.target);
		if (!target) {
			return;
		}

		const inline = target.closest(`[${DATA_ATTRS.inlineContent}]`);
		if (!(inline instanceof HTMLElement) || !tree.blocksHost.contains(inline)) {
			return;
		}

		const blockElement = inline.closest(`[${DATA_ATTRS.editorBlock}]`);
		const blockId = blockElement?.getAttribute(DATA_ATTRS.blockId);
		if (!blockId) {
			return;
		}

		const snapshot = fieldEditor.getSnapshot();
		if (snapshot.isEditing && snapshot.focusBlockId === blockId) {
			return;
		}

		event.preventDefault();
		const point = pointToEditorSelectionPoint(root, event.clientX, event.clientY);
		if (point && point.blockId === blockId) {
			fieldEditor.activateTextSelection(point.blockId, point.offset, point.offset);
		} else {
			const block = editor.getBlock(blockId);
			const offset = block?.length() ?? 0;
			fieldEditor.activateTextSelection(blockId, offset, offset);
		}
		fieldEditor.attachElement(inline);
	};

	root.addEventListener("focusin", handleFocusIn);
	root.addEventListener("focusout", handleFocusOut);
	root.addEventListener("mousedown", handlePointerActivate);
	root.ownerDocument?.addEventListener("keydown", handleDocumentKeyDown, true);

	unsubscribers.push(editor.on("commit", () => tree.sync()));
	unsubscribers.push(fieldEditor.subscribe(() => tree.sync()));

	const destroy = (): void => {
		for (const unsubscribe of unsubscribers) {
			unsubscribe();
		}
		root.removeEventListener("focusin", handleFocusIn);
		root.removeEventListener("focusout", handleFocusOut);
		root.removeEventListener("mousedown", handlePointerActivate);
		root.ownerDocument?.removeEventListener(
			"keydown",
			handleDocumentKeyDown,
			true,
		);
		editor.internals.assignSlot(FIELD_EDITOR_SLOT_KEY, undefined);
		fieldEditor.setRootElement(null);
		fieldEditor.destroy();
		tree.content.remove();
		clearEditorRootAttrs(root);
	};

	return { fieldEditor, root, destroy };
}

function applyEditorRootAttrs(
	root: HTMLElement,
	editor: Editor,
	state: { readonly: boolean; focused: boolean },
): void {
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	root.setAttribute(DATA_ATTRS.viewId, editor.internals.viewId);
	root.setAttribute("role", "textbox");
	root.setAttribute("aria-multiline", "true");
	root.tabIndex = -1;

	const label = resolveEditorA11yLabel(editor);
	if (label["aria-label"]) {
		root.setAttribute("aria-label", label["aria-label"]);
		root.removeAttribute("aria-labelledby");
	} else if (label["aria-labelledby"]) {
		root.setAttribute("aria-labelledby", label["aria-labelledby"]);
		root.removeAttribute("aria-label");
	}

	setBooleanAttr(root, DATA_ATTRS.focused, state.focused);
	setBooleanAttr(root, DATA_ATTRS.readonly, state.readonly);
	setBooleanAttr(root, DATA_ATTRS.empty, computeDocumentEmpty(editor));

	const ariaReadonly = state.readonly || editor.facet(readOnlyFacet);
	if (ariaReadonly) {
		root.setAttribute("aria-readonly", "true");
	} else {
		root.removeAttribute("aria-readonly");
	}
}

function clearEditorRootAttrs(root: HTMLElement): void {
	root.removeAttribute(DATA_ATTRS.editorRoot);
	root.removeAttribute(DATA_ATTRS.viewId);
	root.removeAttribute(DATA_ATTRS.focused);
	root.removeAttribute(DATA_ATTRS.readonly);
	root.removeAttribute(DATA_ATTRS.empty);
	root.removeAttribute("role");
	root.removeAttribute("aria-multiline");
	root.removeAttribute("aria-label");
	root.removeAttribute("aria-labelledby");
	root.removeAttribute("aria-readonly");
	root.removeAttribute("tabindex");
}

function setBooleanAttr(element: HTMLElement, name: string, value: boolean): void {
	if (value) {
		element.setAttribute(name, "");
	} else {
		element.removeAttribute(name);
	}
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
