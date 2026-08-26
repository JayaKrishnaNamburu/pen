import { usesInlineTextSelection } from "@input/pen-core";
import type { PointerInteractionModel } from "../utils/editorInteractionModel";
import {
	createPointerSelectionGesture,
	resolvePointerDragSelection,
} from "../utils/pointerSelection";
import {
	activateCanonicalSelection,
	DRAG_THRESHOLD_PX,
	EDITOR_ROOT_SELECTOR,
	getBoundaryPoint,
	resolveClickedBlockId,
	shouldIgnorePointerGesture,
	type ContentGesturesContext,
} from "./contentGesturesShared";
import { pointToEditorSelectionPoint } from "./selectionBridge";

export function createDragGestures<
	InteractionModel extends PointerInteractionModel,
>(ctx: ContentGesturesContext<InteractionModel>) {
	const {
		editor,
		fieldEditor,
		gestureEl,
		pointerGestureRef,
		pointerGestureVersionRef,
		skipNextClickRef,
		interactionModelRef,
		blockSelectionEnabled,
		runSync,
	} = ctx;

	const handleMouseDown = (event: MouseEvent) => {
		if (fieldEditor.isComposing) return;
		if (shouldIgnorePointerGesture(ctx, event)) return;

		const blockId = resolveClickedBlockId(ctx, event);
		if (!blockId) return;

		pointerGestureVersionRef.current += 1;
		pointerGestureRef.current = createPointerSelectionGesture(editor, {
			blockId,
			clientX: event.clientX,
			clientY: event.clientY,
		});
		fieldEditor.notifyGestureEvent?.("pointerdown");
		skipNextClickRef.current = false;

		const clickedBlock = editor.getBlock(blockId);
		const clickedSchema = clickedBlock
			? editor.schema.resolve(clickedBlock.type)
			: null;
		const root = gestureEl.closest(
			EDITOR_ROOT_SELECTOR,
		) as HTMLElement | null;

		if (
			pointerGestureRef.current &&
			root &&
			clickedSchema &&
			usesInlineTextSelection(clickedSchema) &&
			pointerGestureRef.current.anchorPoint == null
		) {
			const initialPointerPoint = pointToEditorSelectionPoint(
				root,
				event.clientX,
				event.clientY,
			);
			if (initialPointerPoint?.blockId === blockId) {
				pointerGestureRef.current.anchorPoint = initialPointerPoint;
			}
		}
		if (
			pointerGestureRef.current &&
			clickedSchema &&
			!usesInlineTextSelection(clickedSchema) &&
			pointerGestureRef.current.anchorPoint == null
		) {
			pointerGestureRef.current.anchorPoint = getBoundaryPoint(
				ctx,
				blockId,
				"start",
			);
		}

		const shouldPreserveNativeInlinePointerSelection =
			fieldEditor.isEditing &&
			fieldEditor.focusBlockId === blockId &&
			usesInlineTextSelection(clickedSchema);
		if (interactionModelRef.current.clickToSelect) {
			if (fieldEditor.isEditing && fieldEditor.focusBlockId !== blockId) {
				fieldEditor.deactivate();
			}
		} else if (
			fieldEditor.isEditing &&
			!shouldPreserveNativeInlinePointerSelection
		) {
			runSync(() => {
				if (
					typeof fieldEditor.suspendForPointerSelection === "function"
				) {
					fieldEditor.suspendForPointerSelection();
				} else {
					fieldEditor.deactivate();
				}
			});
		}
	};

	const handleRootMouseDown = (
		event: MouseEvent,
		handleContentMouseDown: (event: MouseEvent) => void,
	) => {
		const target = event.target;
		if (target instanceof Node && gestureEl.contains(target)) {
			return;
		}
		handleContentMouseDown(event);
	};

	const handleMouseMove = (event: MouseEvent) => {
		const pointerGesture = pointerGestureRef.current;
		if (!pointerGesture) {
			return;
		}
		const root = gestureEl.closest(
			EDITOR_ROOT_SELECTOR,
		) as HTMLElement | null;
		if (!root) {
			return;
		}
		const moved =
			Math.abs(event.clientX - pointerGesture.clientX) >
				DRAG_THRESHOLD_PX ||
			Math.abs(event.clientY - pointerGesture.clientY) >
				DRAG_THRESHOLD_PX;
		if (!moved) {
			return;
		}
		const resolvedSelection = resolvePointerDragSelection(
			editor,
			root,
			pointerGesture,
			{
				clientX: event.clientX,
				clientY: event.clientY,
				getBoundaryPoint: (blockId, side) =>
					getBoundaryPoint(ctx, blockId, side),
			},
		);
		if (!resolvedSelection) {
			return;
		}
		if (resolvedSelection.mode !== "block") {
			pointerGesture.anchorPoint = resolvedSelection.anchorPoint;
		}
		pointerGesture.promotedDuringDrag = true;
		skipNextClickRef.current = true;

		if (resolvedSelection.mode === "block") {
			if (!blockSelectionEnabled) return;
			editor.selectBlocks(resolvedSelection.blockIds);
			fieldEditor.deactivate();
			return;
		}
		if (resolvedSelection.mode === "mapped-text") {
			fieldEditor.applyDocumentTextSelection(
				resolvedSelection.anchorPoint,
				resolvedSelection.focusPoint,
			);
			return;
		}
		activateCanonicalSelection(
			ctx,
			resolvedSelection.anchorPoint,
			resolvedSelection.focusPoint,
		);
	};

	return {
		handleMouseDown,
		handleRootMouseDown,
		handleMouseMove,
	};
}
