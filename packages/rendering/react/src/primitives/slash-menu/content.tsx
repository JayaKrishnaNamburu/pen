import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@pen/types";
import { EditorContext } from "../../context/editorContext";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { composeRefs } from "../../utils/composeRefs";
import { isDevelopmentEnvironment } from "../../utils/environment";
import { useSlashMenuContext } from "./root";

type Side = "top" | "bottom";

interface SlashMenuPosition {
	top: number;
	left: number;
	maxHeight: number;
	side: Side;
}

export interface SlashMenuContentProps extends AsChildProps {
	/**
	 * Preferred placement side relative to the caret.
	 * @default "bottom"
	 */
	side?: Side;
	/** Horizontal offset in px from the caret. @default 14 */
	alignOffset?: number;
	/** Gap in px between the caret and menu. @default 10 */
	sideOffset?: number;
	/** Minimum max-height in px when viewport space is tight. @default 120 */
	minHeight?: number;
	/** Viewport padding in px. @default 16 */
	viewportPadding?: number;
	ref?: React.Ref<HTMLElement>;
}

export function SlashMenuContent(props: SlashMenuContentProps) {
	const {
		alignOffset = 14,
		minHeight = 120,
		ref,
		side: preferredSide = "bottom",
		sideOffset = 10,
		viewportPadding = 16,
		...rest
	} = props;
	const editorContext = React.useContext(EditorContext);
	const {
		dismiss,
		editor: controllerEditor,
		items,
		open,
		query,
		selectedIndex,
	} = useSlashMenuContext();
	const editor = controllerEditor ?? editorContext?.editor;
	const contentRef = useRef<HTMLElement | null>(null);
	const [position, setPosition] = useState<SlashMenuPosition | null>(null);

	useEffect(() => {
		if (!open || !editor) {
			setPosition(null);
			return;
		}

		let frame = 0;
		const syncPosition = () => {
			window.cancelAnimationFrame(frame);
			frame = window.requestAnimationFrame(() => {
				setPosition(
					resolveMenuPosition({
						alignOffset,
						editor,
						element: contentRef.current,
						minHeight,
						preferredSide,
						sideOffset,
						viewportPadding,
					}),
				);
			});
		};

		syncPosition();
		window.addEventListener("resize", syncPosition);
		window.addEventListener("scroll", syncPosition, true);
		document.addEventListener("selectionchange", syncPosition);

		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener("resize", syncPosition);
			window.removeEventListener("scroll", syncPosition, true);
			document.removeEventListener("selectionchange", syncPosition);
		};
	}, [
		alignOffset,
		editor,
		items.length,
		minHeight,
		open,
		preferredSide,
		query,
		sideOffset,
		viewportPadding,
	]);

	useEffect(() => {
		if (!open) return;

		const handlePointerDown = (event: MouseEvent) => {
			if (contentRef.current?.contains(event.target as Node)) return;
			dismiss();
		};

		document.addEventListener("mousedown", handlePointerDown, true);
		return () =>
			document.removeEventListener("mousedown", handlePointerDown, true);
	}, [dismiss, open]);

	useEffect(() => {
		if (!open) return;

		const selectedItemElement =
			contentRef.current?.querySelector<HTMLElement>(
				"[data-pen-slash-menu-item][data-selected]",
			);
		selectedItemElement?.scrollIntoView({ block: "nearest" });
	}, [open, items.length, selectedIndex]);

	if (!editor) {
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: <Pen.SlashMenu.Content> must be used within <Pen.Editor.Root> or <Pen.SlashMenu.Root editor={editor}>.",
			);
		}
		throw new Error("Missing editor for Pen.SlashMenu.Content");
	}

	if (!open) return null;

	const primitiveProps: Record<string, unknown> = {
		"data-pen-slash-menu-content": "",
		"data-side": position?.side ?? preferredSide,
		style: {
			position: "fixed" as const,
			top: 0,
			left: 0,
			transform: position
				? `translate3d(${Math.round(position.left)}px, ${Math.round(position.top)}px, 0)`
				: undefined,
			maxHeight: position
				? `${Math.round(position.maxHeight)}px`
				: undefined,
			willChange: "transform",
			zIndex: 60,
			visibility: position ? ("visible" as const) : ("hidden" as const),
		},
	};

	return renderAsChild(
		{ ...rest, ref: composeRefs(ref, contentRef) },
		"div",
		primitiveProps,
	);
}

function resolveMenuPosition(options: {
	alignOffset: number;
	editor: Editor;
	element: HTMLElement | null;
	minHeight: number;
	preferredSide: Side;
	sideOffset: number;
	viewportPadding: number;
}): SlashMenuPosition | null {
	const {
		alignOffset,
		editor,
		element,
		minHeight,
		preferredSide,
		sideOffset,
		viewportPadding,
	} = options;

	if (typeof window === "undefined") return null;

	const anchorRect = getAnchorRect(editor);
	if (!anchorRect) return null;

	const elementRect = element?.getBoundingClientRect();
	const menuWidth = elementRect?.width || 320;
	const menuHeight = elementRect?.height || minHeight;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	let side = preferredSide;
	let top =
		side === "top"
			? anchorRect.top - sideOffset - menuHeight
			: anchorRect.bottom + sideOffset;

	if (
		side === "bottom" &&
		top + menuHeight > viewportHeight - viewportPadding
	) {
		side = "top";
		top = anchorRect.top - sideOffset - menuHeight;
	}

	if (side === "top" && top < viewportPadding) {
		side = "bottom";
		top = anchorRect.bottom + sideOffset;
	}

	const left = clamp(
		anchorRect.left - alignOffset,
		viewportPadding,
		viewportWidth - menuWidth - viewportPadding,
	);
	const availableHeight =
		side === "bottom"
			? viewportHeight - top - viewportPadding
			: anchorRect.top - sideOffset - viewportPadding;

	return {
		top: Math.max(viewportPadding, top),
		left,
		maxHeight: Math.max(minHeight, availableHeight),
		side,
	};
}

function getAnchorRect(editor: Editor): DOMRect | null {
	if (typeof window === "undefined") return null;

	const domSelection = window.getSelection();
	if (domSelection?.rangeCount) {
		const range = domSelection.getRangeAt(0).cloneRange();
		range.collapse(false);
		const rect =
			Array.from(range.getClientRects()).at(-1) ??
			range.getBoundingClientRect();
		if (rect.width > 0 || rect.height > 0) {
			return rect;
		}
	}

	const editorSelection = editor.selection;
	if (editorSelection?.type !== "text") return null;

	const blockElement = document.querySelector<HTMLElement>(
		`[data-block-id="${escapeCssAttributeValue(editorSelection.anchor.blockId)}"]`,
	);
	return blockElement?.getBoundingClientRect() ?? null;
}

function escapeCssAttributeValue(value: string): string {
	return value.replace(/["\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number) {
	if (max < min) return min;
	return Math.min(Math.max(value, min), max);
}
