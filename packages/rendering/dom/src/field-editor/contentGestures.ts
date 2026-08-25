/**
 * Pointer gestures over editor content: click, shift-click, drag-select,
 * region (marquee) select, cell select, and the click-outside-blocks
 * affordances.
 *
 * Framework-free. A binding attaches this to its content element and
 * hands it mutable slots for the gesture bookkeeping that must survive
 * across events. React passes `flushSync` as `runSync`; bindings without
 * a batching renderer pass nothing and the call runs inline.
 */
import {
	isCollapsed,
	isMultiBlock,
	usesInlineTextSelection,
} from "@input/pen-core";
import { generateId, type Editor } from "@input/pen-types";
import { measureWithRoot } from "../geometry/rootGeometry";
import {
	getEditorBlockSelectionLength,
	getEditorBlockSelectionRole,
} from "../utils/blockSelectionSemantics";
import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	isRepeatedCellSelection,
	resolveBlockPointerIntent,
	type PointerInteractionModel,
} from "../utils/editorInteractionModel";
import {
	createPointerSelectionGesture,
	resolvePointerDragSelection,
	type PointerSelectionGesture,
} from "../utils/pointerSelection";
import {
	createRegionSelectionRect,
	intersectRegionSelectionRect,
	pointWithinRect,
	regionRectIntersectsBlock,
	resolveRegionRect,
	type RegionSelectionRect,
	type RegionSelectionStore,
	type RegionSelectorConfig,
} from "../utils/regionSelection";
import { normalizeSelectionFormation } from "../utils/selectionFormation";
import type { FieldEditorSession } from "./controller";
import {
	domSelectionToEditor,
	getBlockBoundaryPoint,
	pointToEditorSelectionPoint,
} from "./selectionBridge";

const EDITOR_ROOT_SELECTOR = "[data-pen-editor-root]";
const IGNORE_POINTER_GESTURE_SELECTOR = "[data-pen-ignore-pointer-gesture]";
const DRAG_THRESHOLD_PX = 3;

export interface ContentGestureRegionGesture {
	clientX: number;
	clientY: number;
	isSelecting: boolean;
}

/** A mutable slot. React's `useRef` result satisfies this structurally. */
export interface GestureSlot<T> {
	current: T;
}

export interface ContentGestureState<
	InteractionModel extends PointerInteractionModel,
> {
	regionGesture: GestureSlot<ContentGestureRegionGesture | null>;
	pointerGesture: GestureSlot<PointerSelectionGesture | null>;
	pointerGestureVersion: GestureSlot<number>;
	skipNextClick: GestureSlot<boolean>;
	interactionModel: GestureSlot<InteractionModel>;
	clearPointerSelectionState(): void;
}

export interface AttachContentGesturesOptions<
	InteractionModel extends PointerInteractionModel,
> {
	editor: Editor;
	fieldEditor: FieldEditorSession;
	contentElement: HTMLElement;
	getBlocksHost: () => HTMLElement | null;
	regionSelectionStore: RegionSelectionStore;
	state: ContentGestureState<InteractionModel>;
	blockSelectionEnabled: boolean;
	isDocumentPlaceholderVisible: boolean;
	runSync?: ((run: () => void) => void) | undefined;
}

type SelectionPoint = { blockId: string; offset: number };

export function attachContentGestures<
	InteractionModel extends PointerInteractionModel,
>(options: AttachContentGesturesOptions<InteractionModel>): () => void {
	const {
		editor,
		fieldEditor,
		contentElement: gestureEl,
		getBlocksHost,
		regionSelectionStore,
		state,
		blockSelectionEnabled,
		isDocumentPlaceholderVisible,
	} = options;
	const runSync = options.runSync ?? ((run: () => void) => run());
	const {
		regionGesture: regionGestureRef,
		pointerGesture: pointerGestureRef,
		pointerGestureVersion: pointerGestureVersionRef,
		skipNextClick: skipNextClickRef,
		interactionModel: interactionModelRef,
		clearPointerSelectionState,
	} = state;

	const currentEditorRoot = gestureEl.closest(
		EDITOR_ROOT_SELECTOR,
	) as HTMLElement | null;

	const isWithinNestedEditorRoot = (target: EventTarget | null): boolean => {
		if (!(target instanceof Node)) {
			return false;
		}
		const element =
			target instanceof HTMLElement ? target : target.parentElement;
		const targetRoot = element?.closest(
			EDITOR_ROOT_SELECTOR,
		) as HTMLElement | null;
		return targetRoot != null && targetRoot !== currentEditorRoot;
	};

	const resolveEventTargetElement = (
		target: EventTarget | null,
	): HTMLElement | null => {
		if (target instanceof HTMLElement) {
			return target;
		}
		if (target instanceof Node) {
			return target.parentElement;
		}
		return null;
	};

	const resolveClickedBlockId = (event: MouseEvent): string | null => {
		const target = resolveEventTargetElement(event.target);
		if (!target) return null;
		if (isWithinNestedEditorRoot(target)) return null;
		let blockEl: HTMLElement | null = target;
		while (blockEl && blockEl !== gestureEl) {
			if (blockEl.hasAttribute(DATA_ATTRS.editorBlock)) {
				break;
			}
			blockEl = blockEl.parentElement;
		}
		return blockEl?.getAttribute("data-block-id") ?? null;
	};

	const handleClickOutsideBlocks = (event: MouseEvent): boolean => {
		const blocksHost = getBlocksHost();
		if (!blocksHost) return false;
		const firstBlockEl = blocksHost.querySelector(
			`[${DATA_ATTRS.editorBlock}]`,
		) as HTMLElement | null;
		const lastBlockEl = blocksHost.querySelector(
			`[${DATA_ATTRS.editorBlock}]:last-child`,
		) as HTMLElement | null;

		if (!firstBlockEl || !lastBlockEl) {
			const newBlockId = generateId();
			editor.apply(
				[
					{
						type: "insert-block",
						blockId: newBlockId,
						blockType: "paragraph",
						props: {},
						position: "first",
					},
				],
				{ origin: "user" },
			);
			requestAnimationFrame(() => {
				fieldEditor.activateTextSelection?.(newBlockId, 0, 0);
			});
			return true;
		}

		if (isDocumentPlaceholderVisible) {
			const firstBlock = editor.firstBlock();
			if (firstBlock) {
				const schema = editor.schema.resolve(firstBlock.type);
				if (usesInlineTextSelection(schema)) {
					fieldEditor.activateTextSelection?.(firstBlock.id, 0, 0);
					return true;
				}
			}
		}

		const firstBlockId = firstBlockEl.getAttribute("data-block-id");
		const lastBlockId = lastBlockEl.getAttribute("data-block-id");
		const measured = measureWithRoot(
			currentEditorRoot ?? gestureEl,
			({ reader }) => ({
				firstRect: firstBlockId ? reader.blockRect(firstBlockId) : null,
				lastRect: lastBlockId ? reader.blockRect(lastBlockId) : null,
			}),
		);
		if (!measured.firstRect || !measured.lastRect) return false;

		const clickedAbove = event.clientY < measured.firstRect.top;
		const clickedBelow = event.clientY > measured.lastRect.bottom;
		if (!clickedAbove && !clickedBelow) return false;

		const adjacentBlock = clickedAbove
			? editor.firstBlock()
			: editor.lastBlock();
		if (!adjacentBlock) return false;

		const schema = editor.schema.resolve(adjacentBlock.type);
		if (
			usesInlineTextSelection(schema) &&
			adjacentBlock.textContent().length === 0
		) {
			fieldEditor.activateTextSelection?.(adjacentBlock.id, 0, 0);
			return true;
		}

		const newBlockId = generateId();
		const position = clickedAbove
			? { before: adjacentBlock.id }
			: { after: adjacentBlock.id };
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: newBlockId,
					blockType: "paragraph",
					props: {},
					position,
				},
			],
			{ origin: "user" },
		);
		requestAnimationFrame(() => {
			fieldEditor.activateTextSelection?.(newBlockId, 0, 0);
		});
		return true;
	};

	const resolveClickedCellCoord = (
		event: MouseEvent,
	): { row: number; col: number } | null => {
		const target = resolveEventTargetElement(event.target);
		if (!target) return null;
		if (isWithinNestedEditorRoot(target)) return null;
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
		const target = resolveEventTargetElement(event.target);
		if (!target) return false;
		if (isWithinNestedEditorRoot(target)) return true;
		return !!target.closest(IGNORE_POINTER_GESTURE_SELECTOR);
	};

	const getBoundaryPoint = (
		blockId: string,
		side: "start" | "end",
	): SelectionPoint => {
		const root = gestureEl.closest(
			EDITOR_ROOT_SELECTOR,
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
		return blockOrder.slice(
			Math.min(anchorIdx, targetIdx),
			Math.max(anchorIdx, targetIdx) + 1,
		);
	};

	let shiftClickAnchor: SelectionPoint | null = null;

	const resolveShiftAnchor = (): SelectionPoint | null => {
		const currentSelection = editor.selection;
		if (currentSelection?.type === "text") {
			return currentSelection.anchor;
		}
		if (
			currentSelection?.type === "block" &&
			currentSelection.blockIds.length > 0
		) {
			return getBoundaryPoint(currentSelection.blockIds[0], "start");
		}
		if (fieldEditor.focusBlockId) {
			return getBoundaryPoint(fieldEditor.focusBlockId, "start");
		}
		return null;
	};

	const getRegionSelectorConfig = (
		event: MouseEvent,
	): RegionSelectorConfig | null => {
		if (!blockSelectionEnabled) return null;
		const config = regionSelectionStore.getSnapshot().config;
		if (!config?.enabled) return null;
		if (config.selectionMode !== "block") return null;
		if (config.activation !== "whenInactive") return null;
		if (event.shiftKey || event.button !== 0) return null;
		if (fieldEditor.isComposing) return null;
		if (fieldEditor.focusBlockId) return null;
		if (fieldEditor.isEditing) return null;
		const regionRect = resolveRegionRect(config);
		if (
			regionRect &&
			!pointWithinRect(event.clientX, event.clientY, regionRect)
		) {
			return null;
		}
		if (shouldIgnorePointerGesture(event)) return null;
		if (resolveClickedBlockId(event)) return null;
		return config;
	};

	const getIntersectedBlockIds = (rect: RegionSelectionRect): string[] => {
		const blocksHost = getBlocksHost();
		if (!blocksHost) return [];
		return measureWithRoot(currentEditorRoot ?? gestureEl, ({ reader }) => {
			const selectedIds: string[] = [];
			for (const child of Array.from(blocksHost.children)) {
				if (
					!(child instanceof HTMLElement) ||
					!child.hasAttribute(DATA_ATTRS.editorBlock)
				) {
					continue;
				}
				const blockId = child.getAttribute(DATA_ATTRS.blockId);
				if (!blockId) continue;
				const blockRect = reader.blockRect(blockId);
				if (blockRect && regionRectIntersectsBlock(rect, blockRect)) {
					selectedIds.push(blockId);
				}
			}
			return selectedIds;
		});
	};

	const clearRegionSelectionState = () => {
		regionGestureRef.current = null;
		regionSelectionStore.clearLiveRect();
	};

	const ensureEditorFocus = (root: HTMLElement) => {
		const activeEl = root.ownerDocument?.activeElement;
		if (activeEl instanceof Node && root.contains(activeEl)) return;
		if (
			typeof fieldEditor.requestRootFocus === "function" &&
			!fieldEditor.requestRootFocus(root, "activate", {
				preventScroll: true,
			})
		) {
			return;
		}
		if (typeof fieldEditor.requestRootFocus !== "function") {
			root.focus({ preventScroll: true });
		}
	};

	const activateCanonicalSelection = (
		anchorPoint: SelectionPoint,
		focusPoint: SelectionPoint,
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

		const normalizedSelection = normalizeSelectionFormation(editor, {
			anchor: anchorPoint,
			focus: focusPoint,
		});
		if (normalizedSelection.type === "block") {
			if (!blockSelectionEnabled) return;
			gestureEl.ownerDocument?.getSelection()?.removeAllRanges();
			editor.selectBlocks(normalizedSelection.blockIds);
			fieldEditor.deactivate();
			return;
		}

		const selectedIds = getBlockIdRange(
			normalizedSelection.anchor.blockId,
			normalizedSelection.focus.blockId,
		);
		if (!selectedIds) return;
		fieldEditor.applyDocumentTextSelection(
			normalizedSelection.anchor,
			normalizedSelection.focus,
		);
	};

	const handleClick = (event: MouseEvent) => {
		if (shouldIgnorePointerGesture(event)) {
			return;
		}
		if (skipNextClickRef.current) {
			skipNextClickRef.current = false;
			return;
		}
		const blockId = resolveClickedBlockId(event);
		if (!blockId) {
			if (handleClickOutsideBlocks(event)) {
				event.preventDefault();
			}
			return;
		}
		if (!event.shiftKey) return;

		const anchorPoint = shiftClickAnchor ?? resolveShiftAnchor();
		shiftClickAnchor = null;
		if (!anchorPoint || anchorPoint.blockId === blockId) return;

		const selectedIds = getBlockIdRange(anchorPoint.blockId, blockId);
		if (!selectedIds) return;
		const blockOrder = editor.documentState.blockOrder;
		const selectingForward =
			blockOrder.indexOf(anchorPoint.blockId) <=
			blockOrder.indexOf(blockId);
		activateCanonicalSelection(
			anchorPoint,
			getBoundaryPoint(blockId, selectingForward ? "end" : "start"),
		);
		event.preventDefault();
	};

	const handleMouseDown = (event: MouseEvent) => {
		if (event.button !== 0) return;
		if (event.shiftKey) {
			shiftClickAnchor = resolveShiftAnchor();
			return;
		}
		shiftClickAnchor = null;
		if (fieldEditor.isComposing) return;
		if (shouldIgnorePointerGesture(event)) return;

		const regionSelectorConfig = getRegionSelectorConfig(event);
		if (regionSelectorConfig) {
			regionGestureRef.current = {
				clientX: event.clientX,
				clientY: event.clientY,
				isSelecting: false,
			};
			skipNextClickRef.current = false;
			return;
		}

		const blockId = resolveClickedBlockId(event);
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

	const handleRootMouseDown = (event: MouseEvent) => {
		const target = event.target;
		if (target instanceof Node && gestureEl.contains(target)) {
			return;
		}
		handleMouseDown(event);
	};

	const handleMouseMove = (event: MouseEvent) => {
		const gesture = regionGestureRef.current;
		if (gesture) {
			const config = regionSelectionStore.getSnapshot().config;
			if (!blockSelectionEnabled || !config?.enabled) {
				clearRegionSelectionState();
				return;
			}
			const moved =
				Math.abs(event.clientX - gesture.clientX) > config.threshold ||
				Math.abs(event.clientY - gesture.clientY) > config.threshold;
			if (!gesture.isSelecting && !moved) {
				return;
			}
			if (!gesture.isSelecting) {
				gesture.isSelecting = true;
				skipNextClickRef.current = true;
				gestureEl.ownerDocument?.getSelection()?.removeAllRanges();
			}
			event.preventDefault();
			const boundedRect = intersectRegionSelectionRect(
				createRegionSelectionRect(
					gesture.clientX,
					gesture.clientY,
					event.clientX,
					event.clientY,
				),
				resolveRegionRect(config),
			);
			regionSelectionStore.setLiveRect(boundedRect);
			const selectedIds = boundedRect
				? getIntersectedBlockIds(boundedRect)
				: [];
			if (selectedIds.length > 0) {
				editor.selectBlocks(selectedIds);
			} else {
				editor.setSelection(null);
			}
			fieldEditor.deactivate();
			return;
		}

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
				getBoundaryPoint,
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
			resolvedSelection.anchorPoint,
			resolvedSelection.focusPoint,
		);
	};

	const handleMouseUp = (event: MouseEvent) => {
		const regionGesture = regionGestureRef.current;
		if (regionGesture) {
			const wasSelecting = regionGesture.isSelecting;
			const regionRoot = gestureEl.closest(
				EDITOR_ROOT_SELECTOR,
			) as HTMLElement | null;
			if (wasSelecting) {
				if (!blockSelectionEnabled) {
					skipNextClickRef.current = true;
					clearRegionSelectionState();
					return;
				}
				const config = regionSelectionStore.getSnapshot().config;
				const boundedRect = intersectRegionSelectionRect(
					createRegionSelectionRect(
						regionGesture.clientX,
						regionGesture.clientY,
						event.clientX,
						event.clientY,
					),
					resolveRegionRect(config),
				);
				const selectedIds = boundedRect
					? getIntersectedBlockIds(boundedRect)
					: [];
				if (selectedIds.length > 0) {
					editor.selectBlocks(selectedIds);
					if (regionRoot) {
						ensureEditorFocus(regionRoot);
					}
				} else {
					editor.setSelection(null);
				}
				skipNextClickRef.current = true;
			}
			clearRegionSelectionState();
			if (wasSelecting) {
				return;
			}
		}

		const gesture = pointerGestureRef.current;
		if (!gesture) return;
		const gestureVersion = pointerGestureVersionRef.current;
		clearPointerSelectionState();

		const clickCount = event.detail;
		const clientX = event.clientX;
		const clientY = event.clientY;
		const moved =
			Math.abs(clientX - gesture.clientX) > DRAG_THRESHOLD_PX ||
			Math.abs(clientY - gesture.clientY) > DRAG_THRESHOLD_PX;
		const root = gestureEl.closest(
			EDITOR_ROOT_SELECTOR,
		) as HTMLElement | null;

		const commitCanonicalSelection = (
			anchorPoint: SelectionPoint,
			focusPoint: SelectionPoint,
		) => {
			activateCanonicalSelection(anchorPoint, focusPoint);
			if (root) {
				ensureEditorFocus(root);
			}
			skipNextClickRef.current = true;
		};

		const isSelectionForward = (
			anchorPoint: SelectionPoint,
			focusPoint: SelectionPoint,
		): boolean => {
			const blockOrder = editor.documentState.blockOrder;
			const anchorIdx = blockOrder.indexOf(anchorPoint.blockId);
			const focusIdx = blockOrder.indexOf(focusPoint.blockId);
			if (anchorIdx === focusIdx) {
				return anchorPoint.offset <= focusPoint.offset;
			}
			return anchorIdx <= focusIdx;
		};

		const isExpandedSingleBlockTextSelection = (
			selection: ReturnType<Editor["getSelection"]>,
		): boolean =>
			selection?.type === "text" &&
			!isCollapsed(selection) &&
			!isMultiBlock(selection) &&
			selection.anchor.blockId === selection.focus.blockId;

		const shouldPreferNativeInlineSelection = (
			anchorPoint: SelectionPoint,
			focusPoint: SelectionPoint,
		): boolean =>
			getEditorBlockSelectionRole(editor, anchorPoint.blockId) ===
				"editable-inline" &&
			getEditorBlockSelectionRole(editor, focusPoint.blockId) ===
				"editable-inline";

		const commitMappedTextSelection = (
			anchorPoint: SelectionPoint,
			focusPoint: SelectionPoint,
		): true => {
			if (anchorPoint.blockId !== focusPoint.blockId) {
				fieldEditor.applyDocumentTextSelection(anchorPoint, focusPoint);
				return true;
			}
			if (shouldPreferNativeInlineSelection(anchorPoint, focusPoint)) {
				fieldEditor.applyDomTextSelection(anchorPoint, focusPoint);
				return true;
			}
			commitCanonicalSelection(anchorPoint, focusPoint);
			return true;
		};

		const tryHandleMappedDomSelection = (): boolean => {
			if (!root) {
				return false;
			}
			const startedWithExpandedTextSelection =
				gesture.startSelection?.type === "text" &&
				!isCollapsed(gesture.startSelection);
			if (
				clickCount === 1 &&
				!moved &&
				startedWithExpandedTextSelection
			) {
				const pointerPoint = pointToEditorSelectionPoint(
					root,
					clientX,
					clientY,
				);
				if (pointerPoint) {
					fieldEditor.collapseSelectionToPoint(pointerPoint);
					return true;
				}
			}

			const mappedSelection = domSelectionToEditor(root);
			if (!mappedSelection) {
				return false;
			}

			const hasExpandedSingleBlockTextSelectionAtMouseUp =
				isExpandedSingleBlockTextSelection(gesture.startSelection) ||
				isExpandedSingleBlockTextSelection(editor.selection) ||
				(mappedSelection.anchor.blockId ===
					mappedSelection.focus.blockId &&
					mappedSelection.anchor.offset !==
						mappedSelection.focus.offset);
			if (
				(clickCount === 1 || clickCount >= 4) &&
				hasExpandedSingleBlockTextSelectionAtMouseUp &&
				!moved &&
				mappedSelection.anchor.blockId ===
					mappedSelection.focus.blockId &&
				shouldPreferNativeInlineSelection(
					mappedSelection.anchor,
					mappedSelection.focus,
				)
			) {
				const pointerPoint = pointToEditorSelectionPoint(
					root,
					clientX,
					clientY,
				);
				if (pointerPoint) {
					fieldEditor.collapseSelectionToPoint(pointerPoint);
					return true;
				}
			}

			const collapsed =
				mappedSelection.anchor.blockId ===
					mappedSelection.focus.blockId &&
				mappedSelection.anchor.offset === mappedSelection.focus.offset;
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
					const selectingForward = isSelectionForward(
						mappedSelection.anchor,
						mappedSelection.focus,
					);
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
					commitCanonicalSelection(
						mappedSelection.anchor,
						snappedPoint ?? mappedSelection.focus,
					);
					return true;
				}
				return commitMappedTextSelection(
					mappedSelection.anchor,
					mappedSelection.focus,
				);
			}
			if (startedWithExpandedTextSelection && clickCount < 3) {
				return commitMappedTextSelection(
					mappedSelection.anchor,
					mappedSelection.focus,
				);
			}
			if (moved) {
				return commitMappedTextSelection(
					mappedSelection.anchor,
					mappedSelection.focus,
				);
			}
			return false;
		};

		const tryHandleDraggedPointerSelection = (): boolean => {
			if (!root || !moved) {
				return false;
			}
			const resolvedSelection = resolvePointerDragSelection(
				editor,
				root,
				gesture,
				{ clientX, clientY, getBoundaryPoint },
			);
			if (!resolvedSelection) {
				return false;
			}
			if (resolvedSelection.mode === "block") {
				if (!blockSelectionEnabled) return false;
				editor.selectBlocks(resolvedSelection.blockIds);
				fieldEditor.deactivate();
				ensureEditorFocus(root);
				skipNextClickRef.current = true;
				return true;
			}
			if (resolvedSelection.mode === "mapped-text") {
				return commitMappedTextSelection(
					resolvedSelection.anchorPoint,
					resolvedSelection.focusPoint,
				);
			}
			commitCanonicalSelection(
				resolvedSelection.anchorPoint,
				resolvedSelection.focusPoint,
			);
			return true;
		};

		const tryHandleDraggedBlockSelection = (): boolean => {
			if (!root || !moved) {
				return false;
			}
			const resolvedSelection = resolvePointerDragSelection(
				editor,
				root,
				gesture,
				{ clientX, clientY, getBoundaryPoint },
			);
			if (resolvedSelection?.mode !== "block") {
				return false;
			}
			if (!blockSelectionEnabled) {
				return false;
			}
			editor.selectBlocks(resolvedSelection.blockIds);
			fieldEditor.deactivate();
			ensureEditorFocus(root);
			skipNextClickRef.current = true;
			return true;
		};

		const tryHandleCellSelection = (blockId: string): boolean => {
			const cellCoord = resolveClickedCellCoord(event);
			if (!cellCoord) {
				return false;
			}
			if (clickCount >= 2) {
				fieldEditor.activateCell?.(
					blockId,
					cellCoord.row,
					cellCoord.col,
				);
				skipNextClickRef.current = true;
				return true;
			}
			if (
				isRepeatedCellSelection({
					startSelection: gesture.startSelection,
					selection: editor.selection,
					blockId,
					cellCoord,
				})
			) {
				if (!blockSelectionEnabled) {
					editor.selectCell(blockId, cellCoord.row, cellCoord.col);
					skipNextClickRef.current = true;
					return true;
				}
				editor.selectBlock(blockId);
				if (root) {
					ensureEditorFocus(root);
				}
				skipNextClickRef.current = true;
				return true;
			}
			editor.selectCell(blockId, cellCoord.row, cellCoord.col);
			skipNextClickRef.current = true;
			return true;
		};

		const tryHandleBlockSelection = (
			blockId: string,
			blockType: string,
		): boolean => {
			const schema = editor.schema.resolve(blockType);
			const blockPointerIntent = resolveBlockPointerIntent({
				blockId,
				clickCount,
				moved,
				schema,
				startSelection: gesture.startSelection,
				selection: editor.selection,
				interactionModel: interactionModelRef.current,
			});

			if (blockPointerIntent === "select-block-text") {
				commitCanonicalSelection(
					getBoundaryPoint(blockId, "start"),
					getBoundaryPoint(blockId, "end"),
				);
				return true;
			}
			if (blockPointerIntent === "enter-edit") {
				if (usesInlineTextSelection(schema)) {
					const pointerPoint = root
						? pointToEditorSelectionPoint(root, clientX, clientY)
						: null;
					if (pointerPoint) {
						activateCanonicalSelection(pointerPoint, pointerPoint);
					} else {
						fieldEditor.activate(blockId);
					}
					skipNextClickRef.current = true;
					return true;
				}
				if (!blockSelectionEnabled) {
					return false;
				}
				editor.selectBlock(blockId);
				skipNextClickRef.current = true;
				return true;
			}
			if (blockPointerIntent === "select-block") {
				if (!blockSelectionEnabled) {
					return false;
				}
				editor.selectBlock(blockId);
				fieldEditor.deactivate();
				if (root) {
					ensureEditorFocus(root);
				}
				skipNextClickRef.current = true;
				return true;
			}
			if (!root) {
				fieldEditor.activate(blockId);
				skipNextClickRef.current = true;
				return true;
			}
			const pointerPoint = pointToEditorSelectionPoint(
				root,
				clientX,
				clientY,
			);
			if (!pointerPoint) {
				fieldEditor.activate(blockId);
				skipNextClickRef.current = true;
				return true;
			}
			activateCanonicalSelection(pointerPoint, pointerPoint);
			skipNextClickRef.current = true;
			return true;
		};

		const finalizePointerSelection = () => {
			if (gestureVersion !== pointerGestureVersionRef.current) {
				return;
			}
			if (gesture.promotedDuringDrag) {
				if (root) {
					ensureEditorFocus(root);
				}
				skipNextClickRef.current = true;
				return;
			}
			if (tryHandleDraggedBlockSelection()) {
				return;
			}
			if (tryHandleMappedDomSelection()) {
				return;
			}
			if (tryHandleDraggedPointerSelection()) {
				return;
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
			if (tryHandleCellSelection(blockId)) {
				return;
			}
			tryHandleBlockSelection(blockId, block.type);
		};

		const completePointerSelection = () => {
			try {
				finalizePointerSelection();
			} finally {
				fieldEditor.notifyGestureEvent?.("pointerup");
			}
		};

		if (clickCount > 1) {
			requestAnimationFrame(completePointerSelection);
			return;
		}
		completePointerSelection();
	};

	gestureEl.addEventListener("mousedown", handleMouseDown, true);
	currentEditorRoot?.addEventListener("mousedown", handleRootMouseDown);
	gestureEl.addEventListener("click", handleClick);
	gestureEl.ownerDocument?.addEventListener("mousemove", handleMouseMove);
	gestureEl.ownerDocument?.addEventListener("mouseup", handleMouseUp);

	return () => {
		gestureEl.removeEventListener("mousedown", handleMouseDown, true);
		currentEditorRoot?.removeEventListener(
			"mousedown",
			handleRootMouseDown,
		);
		gestureEl.removeEventListener("click", handleClick);
		gestureEl.ownerDocument?.removeEventListener(
			"mousemove",
			handleMouseMove,
		);
		gestureEl.ownerDocument?.removeEventListener("mouseup", handleMouseUp);
		if (pointerGestureRef.current) {
			fieldEditor.notifyGestureEvent?.("pointerup");
			clearPointerSelectionState();
		}
		clearRegionSelectionState();
	};
}
