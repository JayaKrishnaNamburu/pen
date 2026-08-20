import React, { useContext, useRef } from "react";
import { resolveEditorMessage } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import {
	EditorContext,
	resolveInlineAtomInteractions,
	resolveInteractionModel,
} from "../../context/editorContext";
import {
	ToolbarContext,
	type ToolbarContextValue,
} from "../../context/toolbarContext";
import { useIsomorphicLayoutEffect } from "../../hooks/useIsomorphicLayoutEffect";
import { useToolbar } from "../../hooks/useToolbar";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { composeRefs } from "../../utils/composeRefs";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { getAttachedFieldEditor } from "../../utils/fieldEditor";

/**
 * AX3 detached surface: `role="toolbar"`, roving tabindex, arrow-key
 * navigation within. Escape restores focus to the editing position
 * (field editor / editor root) or the invoking control. This primitive
 * never auto-focuses itself.
 */
export interface ToolbarRootProps extends AsChildProps {
	editor?: Editor;
	ref?: React.Ref<HTMLElement>;
}

export function ToolbarRoot(props: ToolbarRootProps) {
	const { editor: editorProp, ref, ...rest } = props;
	const editorContext = useContext(EditorContext);
	const editor = editorProp ?? editorContext?.editor;
	if (!editor) {
		throw new Error("Missing editor for Pen.Toolbar.Root");
	}

	const state = useToolbar(editor);
	const rootRef = useRef<HTMLElement | null>(null);
	const restoreTargetRef = useRef<HTMLElement | null>(null);

	useIsomorphicLayoutEffect(() => {
		const root = rootRef.current;
		if (!root) {
			return;
		}

		syncRovingTabIndex(root);

		const onFocusIn = (event: FocusEvent) => {
			const related = event.relatedTarget;
			if (related instanceof HTMLElement && !root.contains(related)) {
				restoreTargetRef.current = related;
			}

			const items = collectToolbarItems(root);
			const item = items.find(
				(el) =>
					el === event.target ||
					(event.target instanceof Node && el.contains(event.target)),
			);
			if (!item) {
				return;
			}
			syncRovingTabIndex(root, items.indexOf(item));
		};

		root.addEventListener("focusin", onFocusIn);
		return () => {
			root.removeEventListener("focusin", onFocusIn);
		};
	});

	const editorContextValue = {
		editor,
		readonly: editorContext?.readonly ?? false,
		documentProfile: editor.documentProfile,
		editorViewMode: editorContext?.editorViewMode ?? editor.editorViewMode,
		interactionModel:
			editorContext?.interactionModel ??
			resolveInteractionModel(
				editorContext?.editorViewMode ?? editor.editorViewMode,
			),
		blockDragAndDrop: editorContext?.blockDragAndDrop ?? {
			enabled: false,
		},
		blockSelection: editorContext?.blockSelection ?? {
			enabled: true,
		},
		blockControls: editorContext?.blockControls,
		importers: editorContext?.importers,
		assets: editorContext?.assets,
		renderers: editorContext?.renderers,
		inlineAtomInteractions:
			editorContext?.inlineAtomInteractions ??
			resolveInlineAtomInteractions(),
	};

	const ctx: ToolbarContextValue = { editor, state };

	const handleKeyDown = (event: React.KeyboardEvent) => {
		const root = rootRef.current;
		if (!root) {
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			restoreEditorFocus(editor, root, restoreTargetRef.current);
			return;
		}

		moveRovingFocus(root, event);
	};

	const primitiveProps: Record<string, unknown> = {
		role: "toolbar",
		"aria-label": resolveEditorMessage(editor, "pen.toolbar.formatting"),
		"aria-orientation": "horizontal",
		"data-pen-toolbar": "",
		onKeyDown: handleKeyDown,
	};

	return (
		<EditorContext.Provider value={editorContextValue}>
			<ToolbarContext.Provider value={ctx}>
				{renderAsChild(
					{ ...rest, ref: composeRefs(ref, rootRef) },
					"div",
					primitiveProps,
				)}
			</ToolbarContext.Provider>
		</EditorContext.Provider>
	);
}

const TOOLBAR_ITEM_SELECTOR = [
	"[data-pen-toolbar-button]",
	"[data-pen-toolbar-toggle]",
	"[data-pen-toolbar-select]",
].join(",");

function isEnabledToolbarItem(element: HTMLElement): boolean {
	if (element.getAttribute("aria-disabled") === "true") {
		return false;
	}
	if ("disabled" in element && (element as HTMLButtonElement).disabled) {
		return false;
	}
	return true;
}

function collectToolbarCandidates(root: HTMLElement): HTMLElement[] {
	return Array.from(
		root.querySelectorAll<HTMLElement>(TOOLBAR_ITEM_SELECTOR),
	).filter((element) => element.closest("[data-pen-toolbar]") === root);
}

function collectToolbarItems(root: HTMLElement): HTMLElement[] {
	return collectToolbarCandidates(root).filter(isEnabledToolbarItem);
}

function syncRovingTabIndex(root: HTMLElement, activeIndex?: number): void {
	const candidates = collectToolbarCandidates(root);
	const items = candidates.filter(isEnabledToolbarItem);
	for (const candidate of candidates) {
		if (!items.includes(candidate)) {
			candidate.tabIndex = -1;
		}
	}
	if (items.length === 0) {
		return;
	}

	let index = activeIndex;
	if (index === undefined) {
		index = items.findIndex((item) => item.tabIndex === 0);
		if (index === -1) {
			index = 0;
		}
	}
	index = Math.max(0, Math.min(index, items.length - 1));

	for (let i = 0; i < items.length; i++) {
		items[i]!.tabIndex = i === index ? 0 : -1;
	}
}

function moveRovingFocus(
	root: HTMLElement,
	event: React.KeyboardEvent,
): void {
	const items = collectToolbarItems(root);
	if (items.length === 0) {
		return;
	}

	const currentIndex = items.findIndex(
		(item) =>
			item === event.target ||
			(event.target instanceof Node && item.contains(event.target)),
	);
	if (currentIndex === -1) {
		return;
	}

	const rtl =
		root.ownerDocument.defaultView?.getComputedStyle(root).direction ===
		"rtl";
	let nextIndex: number | null = null;

	switch (event.key) {
		case "ArrowRight":
			nextIndex = rtl ? currentIndex - 1 : currentIndex + 1;
			break;
		case "ArrowLeft":
			nextIndex = rtl ? currentIndex + 1 : currentIndex - 1;
			break;
		case "Home":
			nextIndex = 0;
			break;
		case "End":
			nextIndex = items.length - 1;
			break;
		default:
			return;
	}

	if (nextIndex < 0) {
		nextIndex = items.length - 1;
	} else if (nextIndex >= items.length) {
		nextIndex = 0;
	}

	event.preventDefault();
	syncRovingTabIndex(root, nextIndex);
	items[nextIndex]!.focus();
}

function restoreEditorFocus(
	editor: Editor,
	from: HTMLElement | null,
	invoking: HTMLElement | null,
): void {
	const fieldEditor = getAttachedFieldEditor(editor);
	if (fieldEditor?.focus({ reason: "keyboard", domFocus: true })) {
		return;
	}

	if (invoking?.isConnected) {
		invoking.focus({ preventScroll: true });
		return;
	}

	const ownerDocument = from?.ownerDocument ?? document;
	const root =
		from?.closest<HTMLElement>(`[${DATA_ATTRS.editorRoot}]`) ??
		ownerDocument.querySelector<HTMLElement>(`[${DATA_ATTRS.editorRoot}]`);
	root?.focus({ preventScroll: true });
}
