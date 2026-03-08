import React, { useEffect, useRef, useState } from "react";
import { useSelectionToolbarContext } from "./root.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { composeRefs } from "../../utils/composeRefs.js";

type Side = "top" | "bottom";

export interface SelectionToolbarContentProps extends AsChildProps {
	/**
	 * Preferred placement side relative to the selection.
	 * @default "top"
	 */
	side?: Side;
	/** Gap in px between the selection and the toolbar. @default 8 */
	sideOffset?: number;
	ref?: React.Ref<HTMLElement>;
}

const TOOLBAR_VIEWPORT_PADDING = 8;

export function SelectionToolbarContent(props: SelectionToolbarContentProps) {
	const { side: preferredSide = "top", sideOffset = 8, ref, ...rest } = props;
	const { selectionToolbar } = useSelectionToolbarContext();
	const contentRef = useRef<HTMLElement | null>(null);
	const [position, setPosition] = useState<{
		top: number;
		left: number;
		side: Side;
	} | null>(null);

	const { isOpen, selectionRect } = selectionToolbar;

	useEffect(() => {
		const el = contentRef.current;
		if (!isOpen || !selectionRect || !el) {
			setPosition(null);
			return;
		}

		const elRect = el.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let side = preferredSide;
		let top: number;

		if (side === "top") {
			top = selectionRect.top - sideOffset - elRect.height;
			if (top < TOOLBAR_VIEWPORT_PADDING) {
				side = "bottom";
				top = selectionRect.bottom + sideOffset;
			}
		} else {
			top = selectionRect.bottom + sideOffset;
			if (top + elRect.height > viewportHeight - TOOLBAR_VIEWPORT_PADDING) {
				side = "top";
				top = selectionRect.top - sideOffset - elRect.height;
			}
		}

		let left =
			selectionRect.left + selectionRect.width / 2 - elRect.width / 2;

		left = Math.max(
			TOOLBAR_VIEWPORT_PADDING,
			Math.min(left, viewportWidth - elRect.width - TOOLBAR_VIEWPORT_PADDING),
		);

		setPosition({ top, left, side });
	}, [isOpen, selectionRect, preferredSide, sideOffset]);

	if (!isOpen || !selectionRect) {
		return null;
	}

	const handlePointerDown = (event: React.PointerEvent) => {
		event.preventDefault();
	};

	const primitiveProps: Record<string, unknown> = {
		"data-pen-selection-toolbar-content": "",
		"data-side": position?.side ?? preferredSide,
		role: "toolbar",
		"aria-label": "Formatting",
		onPointerDown: handlePointerDown,
		style: {
			position: "fixed" as const,
			top: 0,
			left: 0,
			transform: position
				? `translate3d(${Math.round(position.left)}px, ${Math.round(position.top)}px, 0)`
				: undefined,
			willChange: "transform",
			zIndex: 50,
			visibility: position ? ("visible" as const) : ("hidden" as const),
		},
	};

	return renderAsChild(
		{ ...rest, ref: composeRefs(ref, contentRef) },
		"div",
		primitiveProps,
	);
}
