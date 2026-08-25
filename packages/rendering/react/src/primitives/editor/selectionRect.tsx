import React, { useEffect, useState } from "react";
import {
	intersectRegionSelectionRect,
	measureWithRoot,
	resolveRegionRect,
	type RegionSelectionRect,
	type RegionSelectorConfig,
} from "@input/pen-dom";
import { useEditorContext } from "../../context/editorContext";
import { useSelection } from "../../hooks/useSelection";
import { useSyncExternalStoreWithSelector } from "../../utils/useSyncExternalStoreWithSelector";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { useEditorRegionSelectionContext } from "./regionSelectionState";

export interface SelectionRectProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function EditorSelectionRect(props: SelectionRectProps) {
	const { blockSelection, editor } = useEditorContext();
	const { rootElement, store } = useEditorRegionSelectionContext();
	const selection = useSelection(editor);
	const [rect, setRect] = useState<DOMRect | null>(null);
	const liveRect = useSyncExternalStoreWithSelector(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
		(snapshot) => snapshot.liveRect,
		rectsEqual,
	);
	const regionConfig = useSyncExternalStoreWithSelector(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
		(snapshot) => snapshot.config,
		configsEqual,
	);

	const isBlockSelection =
		selection?.type === "block" && selection.blockIds.length > 0;

	useEffect(() => {
		if (!blockSelection.enabled) {
			setRect(null);
			return;
		}

		if (liveRect) {
			setRect(
				new DOMRect(
					liveRect.left,
					liveRect.top,
					liveRect.width,
					liveRect.height,
				),
			);
			return;
		}

		if (!isBlockSelection || !rootElement) {
			setRect(null);
			return;
		}

		const computeRect = () => {
			if (!selection || selection.type !== "block") return;
			const regionRect = resolveRegionRect(regionConfig);

			let minTop = Infinity;
			let maxBottom = -Infinity;
			let minLeft = Infinity;
			let maxRight = -Infinity;

			measureWithRoot(rootElement, ({ reader }) => {
				for (const blockId of selection.blockIds) {
					const r = reader.blockRect(blockId);
					if (!r) continue;
					minTop = Math.min(minTop, r.top);
					maxBottom = Math.max(maxBottom, r.bottom);
					minLeft = Math.min(minLeft, r.left);
					maxRight = Math.max(maxRight, r.right);
				}
			});

			if (minTop < Infinity) {
				const boundedRect = intersectRegionSelectionRect(
					{
						left: minLeft,
						top: minTop,
						width: maxRight - minLeft,
						height: maxBottom - minTop,
					},
					regionRect,
				);
				if (!boundedRect) {
					setRect(null);
					return;
				}
				setRect(
					new DOMRect(
						boundedRect.left,
						boundedRect.top,
						boundedRect.width,
						boundedRect.height,
					),
				);
			} else {
				setRect(null);
			}
		};

		computeRect();
	}, [
		blockSelection.enabled,
		selection,
		isBlockSelection,
		liveRect,
		regionConfig,
		rootElement,
	]);

	if (!rect) {
		return null;
	}

	return renderAsChild(props, "div", {
		"data-pen-selection-rect": "",
		"data-selecting": liveRect ? "" : undefined,
		// AX7 overlay — block-selection rectangle is presentation
		"aria-hidden": "true",
		role: "presentation",
		style: {
			position: "fixed",
			top: `${rect.top}px`,
			left: `${rect.left}px`,
			width: `${rect.width}px`,
			height: `${rect.height}px`,
			pointerEvents: "none",
			zIndex: 10,
		},
	});
}

function rectsEqual(
	a: RegionSelectionRect | null,
	b: RegionSelectionRect | null,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.left === b.left &&
		a.top === b.top &&
		a.width === b.width &&
		a.height === b.height
	);
}

function configsEqual(
	a: RegionSelectorConfig | null,
	b: RegionSelectorConfig | null,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.enabled === b.enabled &&
		a.threshold === b.threshold &&
		a.selectionMode === b.selectionMode &&
		a.activation === b.activation &&
		a.getRegionRect === b.getRegionRect
	);
}
