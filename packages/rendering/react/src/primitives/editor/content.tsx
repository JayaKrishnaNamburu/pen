import React, { useRef, useEffect, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { useEditorContext } from "../../context/editorContext.js";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import { shouldUseBlockSelection } from "../../field-editor/crossBlock.js";
import {
	domSelectionToEditor,
	getBlockBoundaryPoint,
	pointToEditorSelectionPoint,
} from "../../field-editor/selectionBridge.js";
import { useFieldEditorState } from "../../hooks/useFieldEditorState.js";
import { useBlockList } from "../../hooks/useBlockList.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { DATA_ATTRS } from "../../utils/dataAttributes.js";
import { EditorBlock } from "./block.js";

export interface EditorContentProps extends AsChildProps {
	virtualize?:
		| boolean
		| {
				overscan?: number;
				estimatedHeight?: number;
				mobileOverscan?: number;
		  };
	ref?: React.Ref<HTMLElement>;
}

export function EditorContent(props: EditorContentProps) {
	const { virtualize: _virtualize, ...rest } = props;
	const { editor, readonly } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const blockIds = useBlockList(editor);
	const contentRef = useRef<HTMLElement>(null);
	const blocksHostRef = useRef<HTMLDivElement>(null);
	const pointerGestureRef = useRef<{
		blockId: string;
		clientX: number;
		clientY: number;
	} | null>(null);
	const skipNextClickRef = useRef(false);

	const isEmpty = blockIds.length === 0;

	useLayoutEffect(() => {
		if (!fieldEditor || fieldEditorState.mode !== "expanded") return;
		if (!blocksHostRef.current) return;
		fieldEditor.attachElement(blocksHostRef.current);
	}, [fieldEditor, fieldEditorState.mode, fieldEditorState.activeBlockIds]);

	// Click-to-activate: when user clicks on a block, activate the field editor.
	// Shift-click: select a range of blocks (AC #22).
	useEffect(() => {
		const gestureEl = contentRef.current;
		if (!gestureEl || readonly || !fieldEditor) return;

		const resolveClickedBlockId = (event: MouseEvent): string | null => {
			const rawTarget = event.target;
			const target =
				rawTarget instanceof HTMLElement
					? rawTarget
					: rawTarget instanceof Node
						? rawTarget.parentElement
						: null;
			if (!target) return null;

			// Walk up to find the nearest block element
			let blockEl: HTMLElement | null = target;
			while (blockEl && blockEl !== gestureEl) {
				if (blockEl.hasAttribute(DATA_ATTRS.editorBlock)) break;
				blockEl = blockEl.parentElement;
			}

			let blockId = blockEl?.getAttribute("data-block-id") ?? null;
			if (!blockId) {
				const firstBlock = editor.firstBlock();
				if (!firstBlock) return null;
				blockId = firstBlock.id;
			}

			return blockId;
		};

		const getBoundaryPoint = (
			blockId: string,
			side: "start" | "end",
		): { blockId: string; offset: number } => {
			const root = gestureEl.closest(
				"[data-pen-editor-root]",
			) as HTMLElement | null;
			return (
				(root ? getBlockBoundaryPoint(root, blockId, side) : null) ?? {
					blockId,
					offset:
						side === "start"
							? 0
							: (editor.getBlock(blockId)?.textContent().length ??
								0),
				}
			);
		};

		const getBlockIdRange = (
			anchorBlockId: string,
			targetBlockId: string,
		): string[] | null => {
			const blockOrder = editor.documentState.blockOrder;
			const anchorIdx = blockOrder.indexOf(anchorBlockId);
			const targetIdx = blockOrder.indexOf(targetBlockId);
			if (anchorIdx < 0 || targetIdx < 0) return null;

			const from = Math.min(anchorIdx, targetIdx);
			const to = Math.max(anchorIdx, targetIdx);
			return blockOrder.slice(from, to + 1);
		};

		const clearPointerSelectionState = () => {
			pointerGestureRef.current = null;
		};

		const activateCanonicalSelection = (
			anchorPoint: { blockId: string; offset: number },
			focusPoint: { blockId: string; offset: number },
		) => {
			if (anchorPoint.blockId === focusPoint.blockId) {
				if (typeof fieldEditor.activateTextSelection === "function") {
					fieldEditor.activateTextSelection(
						anchorPoint.blockId,
						anchorPoint.offset,
						focusPoint.offset,
					);
				} else {
					editor.selectTextRange(anchorPoint, focusPoint);
					fieldEditor.activate(anchorPoint.blockId);
				}
				return;
			}

			const selectedIds = getBlockIdRange(
				anchorPoint.blockId,
				focusPoint.blockId,
			);
			if (!selectedIds) return;

			if (shouldUseBlockSelection(editor, selectedIds.length)) {
				editor.selectBlocks(selectedIds);
				fieldEditor.deactivate();
				return;
			}

			editor.selectTextRange(anchorPoint, focusPoint);
			fieldEditor.activate(focusPoint.blockId);
		};

		const handleClick = (event: MouseEvent) => {
			if (skipNextClickRef.current) {
				skipNextClickRef.current = false;
				event.preventDefault();
				return;
			}

			const blockId = resolveClickedBlockId(event);
			if (!blockId) return;

			// Shift-click: select a range of blocks
			if (event.shiftKey) {
				const currentSelection = editor.selection;
				const anchorPoint =
					currentSelection?.type === "text"
						? currentSelection.anchor
						: currentSelection?.type === "block" &&
							  currentSelection.blockIds.length > 0
							? getBoundaryPoint(
									currentSelection.blockIds[0],
									"start",
								)
							: fieldEditor.focusBlockId
								? getBoundaryPoint(
										fieldEditor.focusBlockId,
										"start",
									)
								: null;

				if (anchorPoint && anchorPoint.blockId !== blockId) {
					const selectedIds = getBlockIdRange(
						anchorPoint.blockId,
						blockId,
					);
					if (!selectedIds) return;

					const blockOrder = editor.documentState.blockOrder;
					const anchorIdx = blockOrder.indexOf(anchorPoint.blockId);
					const targetIdx = blockOrder.indexOf(blockId);
					const selectingForward = anchorIdx <= targetIdx;
					const targetPoint = getBoundaryPoint(
						blockId,
						selectingForward ? "end" : "start",
					);

					if (shouldUseBlockSelection(editor, selectedIds.length)) {
						editor.selectBlocks(selectedIds);
						fieldEditor.deactivate();
						event.preventDefault();
						return;
					}

					activateCanonicalSelection(anchorPoint, targetPoint);
					event.preventDefault();
					return;
				}
			}
		};

		const handleMouseDown = (event: MouseEvent) => {
			if (event.shiftKey || event.button !== 0) return;
			if (fieldEditor.isComposing) return;

			const blockId = resolveClickedBlockId(event);
			if (!blockId) return;

			pointerGestureRef.current = {
				blockId,
				clientX: event.clientX,
				clientY: event.clientY,
			};
			skipNextClickRef.current = false;
			fieldEditor.resetSelectAllCycle?.();

			if (fieldEditor.isEditing) {
				flushSync(() => {
					if (
						typeof fieldEditor.suspendForPointerSelection ===
						"function"
					) {
						fieldEditor.suspendForPointerSelection();
					} else {
						fieldEditor.deactivate();
					}
				});
			}
		};

		const handleMouseUp = (event: MouseEvent) => {
			const gesture = pointerGestureRef.current;
			if (!gesture) return;
			clearPointerSelectionState();

			const root = gestureEl.closest(
				"[data-pen-editor-root]",
			) as HTMLElement | null;
			const mappedSelection = root ? domSelectionToEditor(root) : null;
			const moved =
				Math.abs(event.clientX - gesture.clientX) > 3 ||
				Math.abs(event.clientY - gesture.clientY) > 3;

			if (root && mappedSelection) {
				const collapsed =
					mappedSelection.anchor.blockId ===
						mappedSelection.focus.blockId &&
					mappedSelection.anchor.offset ===
						mappedSelection.focus.offset;

				if (!collapsed) {
					const focusBlockEl = root.querySelector(
						`[data-block-id="${mappedSelection.focus.blockId}"]`,
					) as HTMLElement | null;
					const focusRole =
						focusBlockEl?.getAttribute(DATA_ATTRS.surfaceRole) ?? null;
					const focusType = focusBlockEl?.getAttribute("data-block-type");
					const needsBoundarySnap =
						focusRole === "structural" ||
						focusRole === "delegated" ||
						focusType === "divider" ||
						focusType === "image" ||
						focusType === "codeBlock" ||
						focusType === "table";

					if (needsBoundarySnap) {
						const selectingForward = (() => {
							const blockOrder = editor.documentState.blockOrder;
							const anchorIdx = blockOrder.indexOf(
								mappedSelection.anchor.blockId,
							);
							const focusIdx = blockOrder.indexOf(
								mappedSelection.focus.blockId,
							);
							if (anchorIdx === focusIdx) {
								return (
									mappedSelection.anchor.offset <=
									mappedSelection.focus.offset
								);
							}
							return anchorIdx <= focusIdx;
						})();
						const snappedPoint = pointToEditorSelectionPoint(
							root,
							event.clientX,
							event.clientY,
							{
								preferredBoundary: selectingForward
									? "end"
									: "start",
							},
						);
						activateCanonicalSelection(
							mappedSelection.anchor,
							snappedPoint ?? mappedSelection.focus,
						);
						ensureEditorFocus(root);
						skipNextClickRef.current = true;
						return;
					}

					activateCanonicalSelection(
						mappedSelection.anchor,
						mappedSelection.focus,
					);
					ensureEditorFocus(root);
					skipNextClickRef.current = true;
					return;
				}

				if (moved) {
					activateCanonicalSelection(
						mappedSelection.anchor,
						mappedSelection.focus,
					);
					ensureEditorFocus(root);
					skipNextClickRef.current = true;
					return;
				}
			}

			const blockId = resolveClickedBlockId(event);
			if (!blockId) return;

			const block = editor.getBlock(blockId);
			if (!block) return;

			const schema = editor.schema.resolve(block.type);
			if (schema?.fieldEditor === "none") {
				editor.selectBlock(blockId);
				skipNextClickRef.current = true;
				return;
			}

			if (!root) {
				fieldEditor.activate(blockId);
				skipNextClickRef.current = true;
				return;
			}

			const pointerPoint = pointToEditorSelectionPoint(
				root,
				event.clientX,
				event.clientY,
			);
			if (!pointerPoint) {
				fieldEditor.activate(blockId);
				skipNextClickRef.current = true;
				return;
			}

			activateCanonicalSelection(pointerPoint, pointerPoint);
			skipNextClickRef.current = true;
		};

		const ensureEditorFocus = (root: HTMLElement) => {
			const doc = root.ownerDocument;
			const activeEl = doc?.activeElement;
			if (activeEl instanceof Node && root.contains(activeEl)) return;
			root.focus({ preventScroll: true });
		};

		gestureEl.addEventListener("mousedown", handleMouseDown);
		gestureEl.addEventListener("click", handleClick);
		gestureEl.ownerDocument?.addEventListener("mouseup", handleMouseUp);
		return () => {
			gestureEl.removeEventListener("mousedown", handleMouseDown);
			gestureEl.removeEventListener("click", handleClick);
			gestureEl.ownerDocument?.removeEventListener(
				"mouseup",
				handleMouseUp,
			);
		};
	}, [editor, fieldEditor, readonly]);

	const blockElements = blockIds.map((blockId) => (
		<EditorBlock key={blockId} blockId={blockId} />
	));

	const contentChildren = (
		<>
			<div data-pen-editor-blocks-host="" ref={blocksHostRef}>
				{blockElements}
			</div>
			{rest.children}
		</>
	);

	const primitiveProps: Record<string, unknown> = {
		[DATA_ATTRS.editorContent]: "",
		[DATA_ATTRS.empty]: isEmpty || undefined,
	};

	return renderAsChild(
		{
			...rest,
			ref: contentRef,
			children: contentChildren,
		},
		"div",
		primitiveProps,
	);
}
