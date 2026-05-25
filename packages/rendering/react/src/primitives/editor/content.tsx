import React, {
	useRef,
	useLayoutEffect,
	useSyncExternalStore,
} from "react";
import type { Editor } from "@pen/types";
import { EditorContentContext } from "../../context/editorContentContext";
import { useEditorContext } from "../../context/editorContext";
import { useFieldEditorContext } from "../../context/fieldEditorContext";

import { useFieldEditorState } from "../../hooks/useFieldEditorState";
import { useAIStructuredPreviewContent } from "../../hooks/useAIStructuredPreview";
import { useBlockList } from "../../hooks/useBlockList";
import {
	useDocumentEmptyState,
	useDocumentPlaceholderState,
} from "../../hooks/useDocumentEmptyState";
import { useInlineCompletionState } from "../../hooks/useInlineCompletionState";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { fieldEditorTextEntryAttrs } from "../../utils/fieldEditorTextEntryAttrs";
import { AIStructuredTargetPreviewItem } from "../ai/structuredTargetPreview";
import { AutocompletePreviewBlock } from "./autocompletePreviewBlock";
import { EditorBlock } from "./block";
import {
	DropPreviewProvider,
} from "./dropPreviewContext";
import {
	buildMoveBlockOps,
	useBlockDragSession,
} from "./blockDragSession";
import { useEditorRegionSelectionContext } from "./regionSelectionState";
import { useTransferSession } from "./useTransferSession";
import { useEditorContentPointerState } from "./useEditorContentPointerState";
import { useEditorContentGestures } from "./useEditorContentGestures";
import {
	createInlineDropCaretStyle,
	getInlineAtomDropCaretStyle,
	isNoOpBlockMove,
	resolveBlockDropTarget,
	resolveDraggedBlockIdsFromEvent,
	type InlineDropCaretStyle,
} from "./editorContentDropUtils";
import {
	getInlineAtomDragSnapshot,
	subscribeInlineAtomDragSnapshot,
} from "./inlineAtomInteraction";

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
	const { editor, readonly, blockDragAndDrop, blockSelection, interactionModel } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const { store: regionSelectionStore } = useEditorRegionSelectionContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const blockIds = useBlockList(editor);
	const contentItems = useAIStructuredPreviewContent(editor, blockIds);
	const visibleSuggestion = useInlineCompletionState(editor);
	const blockDragSession = useBlockDragSession();
	const contentRef = useRef<HTMLElement>(null);
	const blocksHostRef = blockDragSession.blocksHostRef as React.RefObject<HTMLDivElement | null>;
	const {
		regionGestureRef,
		pointerGestureRef,
		pointerGestureVersionRef,
		skipNextClickRef,
		interactionModelRef,
		clearPointerSelectionState,
	} = useEditorContentPointerState(interactionModel);

	const isEmpty = useDocumentEmptyState(editor);
	const isDocumentPlaceholderVisible = useDocumentPlaceholderState(editor);
	const {
		isDropActive,
		dropPreview,
		inlineDropCaretStyle: transferInlineDropCaretStyle,
	} = useTransferSession({
		editor,
		readonly,
		contentRef,
	});
	const inlineAtomDragSnapshot = useSyncExternalStore(
		subscribeInlineAtomDragSnapshot,
		getInlineAtomDragSnapshot,
		getInlineAtomDragSnapshot,
	);
	const inlineAtomDropCaretStyle = getInlineAtomDropCaretStyle({
		editor,
		contentElement: contentRef.current,
		snapshot: inlineAtomDragSnapshot,
	});
	const activeInlineDropCaretStyle =
		transferInlineDropCaretStyle ?? inlineAtomDropCaretStyle;
	const isInlineAtomDropActive = inlineAtomDropCaretStyle !== null;

	useLayoutEffect(() => {
		if (!fieldEditor || fieldEditorState.mode !== "expanded") return;
		if (!blocksHostRef.current) return;
		fieldEditor.attachElement(blocksHostRef.current);
	}, [fieldEditor, fieldEditorState.mode, fieldEditorState.activeBlockIds]);

	// Click-to-activate: when user clicks on a block, activate the field editor.
	// Shift-click: select a range of blocks (AC #22).

	useEditorContentGestures({
		editor,
		readonly,
		fieldEditor,
		blockSelection,
		contentRef,
		blocksHostRef,
		regionSelectionStore,
		isDocumentPlaceholderVisible,
		regionGestureRef,
		pointerGestureRef,
		pointerGestureVersionRef,
		skipNextClickRef,
		interactionModelRef,
		clearPointerSelectionState,
	});

	const blockElements: React.ReactElement[] = [];
	const previewBlocks = visibleSuggestion?.previewBlocks ?? [];
	const anchorBlock = visibleSuggestion
		? editor.getBlock(visibleSuggestion.blockId)
		: null;
	for (const contentItem of contentItems) {
		if (contentItem.kind === "block") {
			blockElements.push(
				<EditorBlock key={contentItem.blockId} blockId={contentItem.blockId} />,
			);
			if (
				previewBlocks.length > 0 &&
				contentItem.blockId === visibleSuggestion?.blockId
			) {
				const previewBlockElements = previewBlocks.map((previewBlock, previewIndex) => (
					<AutocompletePreviewBlock
						key={`autocomplete-preview:${previewBlock.id}`}
						anchorBlock={anchorBlock}
						anchorBlockType={anchorBlock?.type}
						anchorProps={anchorBlock?.props ?? null}
						block={previewBlock}
						previewIndex={previewIndex}
					/>
				));
				blockElements.push(...previewBlockElements);
			}
			continue;
		}
		blockElements.push(
			<div
				key={`virtual-target:${contentItem.target.blockId}`}
				data-pen-ai-structured-virtual-target=""
				data-block-type={contentItem.target.targetKind}
				data-plan-state={contentItem.planState}
				{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
			>
				<AIStructuredTargetPreviewItem target={contentItem.target} />
			</div>,
		);
	}

	const inlineDropCaret =
		(isDropActive || isInlineAtomDropActive) && activeInlineDropCaretStyle ? (
			<div
				aria-hidden="true"
				{...{ [DATA_ATTRS.dropCaret]: "" }}
				style={createInlineDropCaretStyle(activeInlineDropCaretStyle)}
			/>
		) : null;

	const handleBlockDragOver = (event: React.DragEvent<HTMLElement>) => {
		if (readonly || !blockDragAndDrop.enabled || !blocksHostRef.current) {
			return;
		}

		const draggedBlockIds = resolveDraggedBlockIdsFromEvent(
			event.dataTransfer,
			blockDragSession.viewId,
			blockDragSession.draggedRef.current?.blockIds ?? null,
		);
		if (!draggedBlockIds) {
			return;
		}

		const target = resolveBlockDropTarget({
			blockIds,
			blocksHost: blocksHostRef.current,
			draggedBlockIds,
			clientY: event.clientY,
		});
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
		if (!target) {
			blockDragSession.clearDropTarget();
			return;
		}
		blockDragSession.setDropTarget(target.blockId, target.position);
	};

	const handleBlockDrop = (event: React.DragEvent<HTMLElement>) => {
		if (readonly || !blockDragAndDrop.enabled || !blocksHostRef.current) {
			return;
		}

		const draggedBlockIds = resolveDraggedBlockIdsFromEvent(
			event.dataTransfer,
			blockDragSession.viewId,
			blockDragSession.draggedRef.current?.blockIds ?? null,
		);
		if (!draggedBlockIds) {
			return;
		}

		const target = resolveBlockDropTarget({
			blockIds,
			blocksHost: blocksHostRef.current,
			draggedBlockIds,
			clientY: event.clientY,
		});
		if (!target) {
			blockDragSession.clearDropTarget();
			blockDragSession.endDrag();
			return;
		}

		const moveOps = buildMoveBlockOps({
			blockIds: draggedBlockIds,
			targetBlockId: target.blockId,
			dropPosition: target.position,
		});
		if (
			moveOps.length === 0 ||
			isNoOpBlockMove(editor.documentState.blockOrder, moveOps)
		) {
			blockDragSession.clearDropTarget();
			blockDragSession.endDrag();
			return;
		}

		event.preventDefault();
		editor.apply(moveOps, { origin: "user" });
		blockDragSession.clearDropTarget();
		blockDragSession.endDrag();
	};

	const handleBlockDragLeave = (event: React.DragEvent<HTMLElement>) => {
		const relatedTarget = event.relatedTarget;
		if (
			relatedTarget instanceof Node &&
			event.currentTarget.contains(relatedTarget)
		) {
			return;
		}
		blockDragSession.clearDropTarget();
	};

	const contentChildren = (
		<>
			<div
				data-pen-editor-blocks-host=""
				{...(fieldEditorState.mode === "expanded"
					? {
						[DATA_ATTRS.fieldEditorSurface]: "",
						...fieldEditorTextEntryAttrs(true),
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
		[DATA_ATTRS.dropTarget]: isDropActive || isInlineAtomDropActive || undefined,
		[DATA_ATTRS.empty]: isEmpty || undefined,
		onDragOver: handleBlockDragOver,
		onDrop: handleBlockDrop,
		onDragLeave: handleBlockDragLeave,
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

