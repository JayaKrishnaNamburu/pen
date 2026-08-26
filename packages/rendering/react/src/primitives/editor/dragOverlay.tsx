import React from "react";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useBlockDragSession } from "./blockDragSession";

export interface DragOverlayProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

/**
 * Optional overlay primitive during block drag.
 * By default renders nothing — the browser's native drag ghost is used.
 * Consumers can mount this and provide children for custom overlay UI.
 */
export function EditorDragOverlay(props: DragOverlayProps) {
	const { state } = useBlockDragSession();

	if (typeof window === "undefined" || !state.active) return null;
	if (!props.children) return null;

	const node = renderAsChild(props, "div", {
		"data-pen-drag-overlay": "",
		// AX7 overlay — block-drag ghost is presentation
		"aria-hidden": "true",
		style: {
			position: "fixed",
			pointerEvents: "none",
			zIndex: 9999,
		},
	});

	// ax7: overlay chrome stays presentation-only; asChild must not drop these.
	const existingStyle = (node.props as { style?: React.CSSProperties }).style;
	return React.cloneElement(
		node as React.ReactElement<Record<string, unknown>>,
		{
			// AX7 overlay — asChild clone re-asserts presentation
			"aria-hidden": "true",
			style: {
				...existingStyle,
				pointerEvents: "none",
			},
		},
	);
}
