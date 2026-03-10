import React, { useRef, useEffect, useLayoutEffect } from "react";
import type { Editor } from "@pen/core";
import {
	delegatesToGridEditing,
	generateId,
	usesInlineTextSelection,
} from "@pen/core";
import { flushSync } from "react-dom";
import { EditorContentContext } from "../../context/editorContentContext";
import { useEditorContext } from "../../context/editorContext";
import { useFieldEditorContext } from "../../context/fieldEditorContext";
import { shouldUseBlockSelection } from "../../field-editor/crossBlock";
import {
	domSelectionToEditor,
	getBlockBoundaryPoint,
	pointToEditorSelectionPoint,
} from "../../field-editor/selectionBridge";
import { useFieldEditorState } from "../../hooks/useFieldEditorState";
import { useBlockList } from "../../hooks/useBlockList";
import {
	getEditorBlockSelectionLength,
	getEditorBlockSelectionRole,
} from "../../utils/blockSelectionSemantics";
import {
	useDocumentEmptyState,
	useDocumentPlaceholderState,
} from "../../hooks/useDocumentEmptyState";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { EditorBlock } from "./block";
import {
	DropPreviewProvider,
} from "./dropPreviewContext";
import { useTransferSession } from "./useTransferSession";

export interface EditorContentProps extends AsChildProps {
	virtualize?:
	| boolean
	| {
		overscan?: number;
		estimatedHeight?: number;
		mobileOverscan?: number;
	};
	emptyPlaceholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function EditorContent(props: EditorContentProps) {
	const { virtualize: _virtualize, emptyPlaceholder, ...rest } = props;
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
		startSelection: ReturnType<Editor["getSelection"]>;
	} | null>(null);
	const skipNextClickRef = useRef(false);

	const isEmpty = useDocumentEmptyState(editor);
	const isDocumentPlaceholderVisible = useDocumentPlaceholderState(editor);
	const { isDropActive, dropPreview, inlineDropCaretStyle } =
		useTransferSession({
			editor,
			readonly,
			contentRef,
		});

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

			let blockEl: HTMLElement | null = target;
			while (blockEl && blockEl !== gestureEl) {
				if (blockEl.hasAttribute(DATA_ATTRS.editorBlock)) break;
				blockEl = blockEl.parentElement;
			}

			const blockId = blockEl?.getAttribute("data-block-id") ?? null;
			return blockId;
		};

		const handleClickOutsideBlocks = (event: MouseEvent): boolean => {
			const fe = fieldEditor;
			if (readonly || !fe) return false;
			const blocksHost = blocksHostRef.current;
			if (!blocksHost) return false;

			const firstBlockEl = blocksHost.querySelector(
				`[${DATA_ATTRS.editorBlock}]`,
			) as HTMLElement | null;
			const lastBlockEl = blocksHost.querySelector(
				`[${DATA_ATTRS.editorBlock}]:last-child`,
			) as HTMLElement | null;
			if (!firstBlockEl || !lastBlockEl) return false;

			const firstRect = firstBlockEl.getBoundingClientRect();
			const lastRect = lastBlockEl.getBoundingClientRect();
			const clickedAbove = event.clientY < firstRect.top;
			const clickedBelow = event.clientY > lastRect.bottom;

			if (!clickedAbove && !clickedBelow) return false;

			const adjacentBlock = clickedAbove ? editor.firstBlock() : editor.lastBlock();
			if (!adjacentBlock) return false;

			const schema = editor.schema.resolve(adjacentBlock.type);
			if (
				usesInlineTextSelection(schema) &&
				adjacentBlock.textContent().length === 0
			) {
				fe.activateTextSelection?.(adjacentBlock.id, 0, 0);
				return true;
			}

			const newBlockId = generateId();
			const position = clickedAbove
				? { before: adjacentBlock.id }
				: { after: adjacentBlock.id };
			editor.apply([{
				type: "insert-block",
				blockId: newBlockId,
				blockType: "paragraph",
				props: {},
				position,
			}], { origin: "user" });
			requestAnimationFrame(() => {
				fe.activateTextSelection?.(newBlockId, 0, 0);
			});
			return true;
		};

		const resolveClickedCellCoord = (
			event: MouseEvent,
			blockId: string,
		): { row: number; col: number } | null => {
			const rawTarget = event.target;
			const target =
				rawTarget instanceof HTMLElement
					? rawTarget
					: rawTarget instanceof Node
						? rawTarget.parentElement
						: null;
			if (!target) return null;

			const cellEl = target.closest(
				`[${DATA_ATTRS.tableCell}]`,
			) as HTMLElement | null;
			if (!cellEl) return null;

			const rowAttr = cellEl.getAttribute(DATA_ATTRS.tableCellRow);
			const colAttr = cellEl.getAttribute(DATA_ATTRS.tableCellCol);
			if (rowAttr == null || colAttr == null) return null;

			const row = parseInt(rowAttr, 10);
			const col = parseInt(colAttr, 10);
			if (isNaN(row) || isNaN(col)) return null;

			return { row, col };
		};

		const shouldIgnorePointerGesture = (event: MouseEvent): boolean => {
			const rawTarget = event.target;
			const target =
				rawTarget instanceof HTMLElement
					? rawTarget
					: rawTarget instanceof Node
						? rawTarget.parentElement
						: null;
			if (!target) return false;

			return !!target.closest("[data-pen-ignore-pointer-gesture]");
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
							: getEditorBlockSelectionLength(editor, blockId),
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
			if (shouldIgnorePointerGesture(event)) {
				return;
			}

			if (skipNextClickRef.current) {
				skipNextClickRef.current = false;
				event.preventDefault();
				return;
			}

			const blockId = resolveClickedBlockId(event);
			if (!blockId) {
				if (handleClickOutsideBlocks(event)) {
					event.preventDefault();
				}
				return;
			}

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
			if (shouldIgnorePointerGesture(event)) return;

			const blockId = resolveClickedBlockId(event);
			if (!blockId) return;

			pointerGestureRef.current = {
				blockId,
				clientX: event.clientX,
				clientY: event.clientY,
				startSelection: editor.getSelection(),
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

			const clickCount = event.detail;
			const clientX = event.clientX;
			const clientY = event.clientY;
			const moved =
				Math.abs(clientX - gesture.clientX) > 3 ||
				Math.abs(clientY - gesture.clientY) > 3;

			const finalizePointerSelection = () => {
				const root = gestureEl.closest(
					"[data-pen-editor-root]",
				) as HTMLElement | null;
				const mappedSelection = root ? domSelectionToEditor(root) : null;

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
						const focusType =
							focusBlockEl?.getAttribute("data-block-type");
						const needsBoundarySnap =
							focusRole === "structural" ||
							focusRole === "delegated" ||
							focusType === "divider" ||
							focusType === "image" ||
							focusType === "codeBlock" ||
							focusType === "table" ||
							focusType === "database";

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
								clientX,
								clientY,
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

				if (root && moved) {
					const focusPoint = pointToEditorSelectionPoint(root, clientX, clientY);
					if (focusPoint) {
						const anchorRole = getEditorBlockSelectionRole(
							editor,
							gesture.blockId,
						);
						const focusRole = getEditorBlockSelectionRole(
							editor,
							focusPoint.blockId,
						);
						if (
							anchorRole === "editable-inline" &&
							focusRole === "editable-inline"
						) {
							// Let native cross-block selection remain the source of truth
							// when both ends are inline-editable and the browser gave us no range.
						} else {
						const blockOrder = editor.documentState.blockOrder;
						const anchorIdx = blockOrder.indexOf(gesture.blockId);
						const focusIdx = blockOrder.indexOf(focusPoint.blockId);
						if (anchorIdx >= 0 && focusIdx >= 0) {
							const selectingForward = anchorIdx <= focusIdx;
							const anchorPoint =
								anchorRole === "editable-inline"
									? getBoundaryPoint(
										gesture.blockId,
										selectingForward ? "end" : "start",
									)
									: getBoundaryPoint(
										gesture.blockId,
										selectingForward ? "start" : "end",
									);
							const normalizedFocusPoint =
								focusRole === "editable-inline"
									? focusPoint
									: getBoundaryPoint(
										focusPoint.blockId,
										selectingForward ? "end" : "start",
									);
							activateCanonicalSelection(anchorPoint, normalizedFocusPoint);
							ensureEditorFocus(root);
							skipNextClickRef.current = true;
							return;
						}
						}
					}
				}

				const blockId = resolveClickedBlockId(event) ?? gesture.blockId;
				if (!blockId) {
					if (handleClickOutsideBlocks(event)) {
						skipNextClickRef.current = true;
					}
					return;
				}

				const block = editor.getBlock(blockId);
				if (!block) return;

				const cellCoord = resolveClickedCellCoord(event, blockId);
				if (cellCoord) {
					if (clickCount >= 2) {
						fieldEditor.activateCell?.(blockId, cellCoord.row, cellCoord.col);
						skipNextClickRef.current = true;
						return;
					}

					const selection = editor.selection;
					const startedOnSameSingleCell =
						gesture.startSelection?.type === "cell" &&
						gesture.startSelection.blockId === blockId &&
						gesture.startSelection.anchor.row === cellCoord.row &&
						gesture.startSelection.anchor.col === cellCoord.col &&
						gesture.startSelection.head.row === cellCoord.row &&
						gesture.startSelection.head.col === cellCoord.col;
					const isSameSingleCell =
						selection?.type === "cell" &&
						selection.blockId === blockId &&
						selection.anchor.row === cellCoord.row &&
						selection.anchor.col === cellCoord.col &&
						selection.head.row === cellCoord.row &&
						selection.head.col === cellCoord.col;
					if (startedOnSameSingleCell && isSameSingleCell) {
						editor.selectBlock(blockId);
						if (root) {
							ensureEditorFocus(root);
						}
						skipNextClickRef.current = true;
						return;
					}

					editor.selectCell(blockId, cellCoord.row, cellCoord.col);
					skipNextClickRef.current = true;
					return;
				}

				const schema = editor.schema.resolve(block.type);

				if (delegatesToGridEditing(schema) && !cellCoord) {
					editor.selectBlock(blockId);
					skipNextClickRef.current = true;
					return;
				}

				if (schema?.fieldEditor === "none") {
					editor.selectBlock(blockId);
					skipNextClickRef.current = true;
					return;
				}

				if (clickCount >= 3) {
					const blockStart = getBoundaryPoint(blockId, "start");
					const blockEnd = getBoundaryPoint(blockId, "end");
					activateCanonicalSelection(blockStart, blockEnd);
					if (root) {
						ensureEditorFocus(root);
					}
					skipNextClickRef.current = true;
					return;
				}

				if (!root) {
					fieldEditor.activate(blockId);
					skipNextClickRef.current = true;
					return;
				}

				const pointerPoint = pointToEditorSelectionPoint(root, clientX, clientY);
				if (!pointerPoint) {
					fieldEditor.activate(blockId);
					skipNextClickRef.current = true;
					return;
				}

				activateCanonicalSelection(pointerPoint, pointerPoint);
				skipNextClickRef.current = true;
			};

			if (clickCount > 1) {
				requestAnimationFrame(finalizePointerSelection);
				return;
			}

			finalizePointerSelection();
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

	const inlineDropCaret =
		isDropActive && inlineDropCaretStyle ? (
			<div
				aria-hidden="true"
				{...{ [DATA_ATTRS.dropCaret]: "" }}
				style={{
					left: `${inlineDropCaretStyle.left}px`,
					top: `${inlineDropCaretStyle.top}px`,
					height: `${inlineDropCaretStyle.height}px`,
				}}
			/>
		) : null;

	const contentChildren = (
		<>
			<div
				data-pen-editor-blocks-host=""
				{...(fieldEditorState.mode === "expanded"
					? {
						[DATA_ATTRS.fieldEditorSurface]: "",
						[DATA_ATTRS.fieldEditorActiveSurface]: "",
					}
					: {})}
				ref={blocksHostRef}
			>
				{blockElements}
			</div>
			{inlineDropCaret}
			{rest.children}
		</>
	);

	const primitiveProps: Record<string, unknown> = {
		[DATA_ATTRS.editorContent]: "",
		[DATA_ATTRS.dropTarget]: isDropActive || undefined,
		[DATA_ATTRS.empty]: isEmpty || undefined,
	};

	return (
		<EditorContentContext.Provider
			value={{ emptyPlaceholder, isEmpty: isDocumentPlaceholderVisible }}
		>
			<DropPreviewProvider value={dropPreview}>
				{renderAsChild(
					{
						...rest,
						ref: contentRef,
						children: contentChildren,
					},
					"div",
					primitiveProps,
				)}
			</DropPreviewProvider>
		</EditorContentContext.Provider>
	);
}
