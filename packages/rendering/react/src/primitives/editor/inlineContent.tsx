import React, { useRef, useLayoutEffect, useState } from "react";
import {
	getOpOriginType,
	type Decoration,
	type Editor,
	type InlineDecoration,
} from "@pen/types";
import { getLogicalTextContent } from "@pen/dom/field-editor/inlineAtomDom";
import { INLINE_ATOM_REPLACEMENT_TEXT } from "@pen/dom/field-editor/inlineAtomModel";
import { useEditorContentContext } from "../../context/editorContentContext";
import { useEditorContext } from "../../context/editorContext";
import { useFieldEditorContext } from "../../context/fieldEditorContext";
import { fullReconcileDeltasToDOM } from "../../field-editor/reconciler";
import { useBlockEditingState } from "../../hooks/useBlockEditingState";
import { useBlockCommitState } from "../../hooks/useBlockCommitState";
import { useBlockDecorations } from "../../hooks/useBlockDecorations";
import { useSelection } from "../../hooks/useSelection";
import { useBlockTextSnapshot } from "../../hooks/useBlockTextSnapshot";
import { useFieldEditorState } from "../../hooks/useFieldEditorState";
import { useInlineCompletionState } from "../../hooks/useInlineCompletionState";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { fieldEditorTextEntryAttrs } from "../../utils/fieldEditorTextEntryAttrs";
import {
	applyInlineDecorationsToDeltas,
	filterVisibleInlineDecorationDeltas,
} from "../../utils/inlineDecorations";
import { isInlineContentEmpty } from "../../utils/editorEmptyState";
import { resolveInlinePlaceholderVisibility } from "../../utils/placeholderVisibility";
import { InlineAtomPortalLayer } from "./InlineAtomPortalLayer";
import {
	resolveNextInlineAtomTargets,
	type InlineAtomRenderTarget,
} from "./inlineAtomTargets";

export interface InlineContentProps extends AsChildProps {
	blockId: string;
	className?: string;
	decorations?: readonly Decoration[];
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function InlineContent(props: InlineContentProps) {
	const {
		blockId,
		className,
		decorations: blockDecorationsProp,
		placeholder: placeholderProp,
		...rest
	} = props;
	const { editor, inlineAtomInteractions, inlineAtomRenderers, readonly } =
		useEditorContext();
	const { emptyPlaceholder, isEmpty: isDocumentEmpty } =
		useEditorContentContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const isActive = useBlockEditingState(fieldEditor, blockId);
	const selection = useSelection(editor);
	const blockCommit = useBlockCommitState(editor, blockId);
	const subscribedBlockDecorations = useBlockDecorations(editor, blockId);
	const blockDecorations = blockDecorationsProp ?? subscribedBlockDecorations;
	const textSnapshot = useBlockTextSnapshot(editor, blockId);
	const visibleInlineCompletion = useInlineCompletionState(editor);
	const elementRef = useRef<HTMLElement>(null);
	const previousCommitRevisionRef = useRef(blockCommit.revision);
	const previousRenderedDeltasSignatureRef = useRef<string | null>(null);
	const inlineAtomTargetsRef = useRef<InlineAtomRenderTarget[]>([]);
	const [inlineAtomTargets, setInlineAtomTargets] = useState<
		InlineAtomRenderTarget[]
	>([]);
	const isExpandedOwnedBlock =
		fieldEditorState.mode === "expanded" &&
		fieldEditorState.activeBlockIds.includes(blockId);

	const isFirstBlock = editor.documentState.blockOrder[0] === blockId;
	const schemaPlaceholder = resolveSchemaPlaceholder(editor, blockId);
	const isFocusedBlock =
		isActive ||
		(selection?.type === "text" &&
			selection.isCollapsed &&
			selection.focus.blockId === blockId);

	const blockTextEmpty = isInlineContentEmpty(textSnapshot.deltas);
	const emptyInlineCompletionText =
		visibleInlineCompletion?.type === "inline" &&
		visibleInlineCompletion.blockId === blockId &&
		blockTextEmpty &&
		visibleInlineCompletion.text.length > 0
			? visibleInlineCompletion.text
			: null;
	const {
		showDocumentPlaceholder,
		showExplicitPlaceholder,
		showBlockPlaceholder,
	} = resolveInlinePlaceholderVisibility({
		blockTextEmpty,
		isDocumentEmpty,
		isFirstBlock,
		isFocusedBlock,
		hasEmptyPlaceholder: !!emptyPlaceholder,
		hasExplicitPlaceholder: !!placeholderProp,
		hasSchemaPlaceholder: !!schemaPlaceholder,
		suppressPlaceholders: visibleInlineCompletion !== null,
	});

	const placeholder = showDocumentPlaceholder
		? emptyPlaceholder
		: showExplicitPlaceholder
			? placeholderProp
			: showBlockPlaceholder
				? schemaPlaceholder
				: undefined;
	const inlineDecorations = blockDecorations.filter(
		(decoration): decoration is InlineDecoration =>
			decoration.type === "inline",
	);
	const decoratedDeltas =
		inlineDecorations.length > 0
			? applyInlineDecorationsToDeltas(
					textSnapshot.deltas,
					inlineDecorations,
				)
			: textSnapshot.deltas;
	const renderedDeltas = filterVisibleInlineDecorationDeltas(decoratedDeltas);
	const renderedDeltasText = getDeltaText(renderedDeltas);
	const renderedDeltasSignature = getDeltaSignature(renderedDeltas);

	useLayoutEffect(() => {
		if (fieldEditorState.mode === "expanded") {
			return;
		}
		if (isActive && elementRef.current && fieldEditor) {
			fieldEditor.attachElement(elementRef.current);
		}
	}, [isActive, fieldEditor, fieldEditorState.mode, blockId]);

	useLayoutEffect(() => {
		const syncInlineAtomTargets = () => {
			const nextTargets = resolveNextInlineAtomTargets(
				elementRef.current,
				inlineAtomRenderers,
				editor.schema,
				renderedDeltas,
				inlineAtomTargetsRef.current,
			);
			if (nextTargets !== inlineAtomTargetsRef.current) {
				inlineAtomTargetsRef.current = nextTargets;
				setInlineAtomTargets(nextTargets);
			}
		};

		const didCommitAdvance =
			blockCommit.revision !== previousCommitRevisionRef.current;
		previousCommitRevisionRef.current = blockCommit.revision;

		const activeElement = elementRef.current?.ownerDocument?.activeElement;
		const isBackendOwned =
			!!elementRef.current &&
			isActive &&
			(activeElement instanceof Node
				? elementRef.current.contains(activeElement)
				: false);
		const shouldForceCommitReconcile =
			didCommitAdvance &&
			blockCommit.origin !== null &&
			getOpOriginType(blockCommit.origin) === "history";

		if (isExpandedOwnedBlock || isActive) {
			if (!elementRef.current || fieldEditorState.isComposing) {
				syncInlineAtomTargets();
				return;
			}
			if (!textSnapshot.exists) {
				elementRef.current.replaceChildren();
				previousRenderedDeltasSignatureRef.current = null;
				syncInlineAtomTargets();
				return;
			}
			if (
				!shouldForceCommitReconcile &&
				getLogicalTextContent(elementRef.current) ===
					renderedDeltasText &&
				previousRenderedDeltasSignatureRef.current ===
					renderedDeltasSignature
			) {
				syncInlineAtomTargets();
				return;
			}
			fullReconcileDeltasToDOM(
				[...renderedDeltas],
				elementRef.current,
				editor.schema,
				{ preserveSelection: true },
			);
			previousRenderedDeltasSignatureRef.current =
				renderedDeltasSignature;
			syncInlineAtomTargets();
			return;
		}
		if (!elementRef.current) {
			syncInlineAtomTargets();
			return;
		}
		if (
			!shouldForceCommitReconcile &&
			(isBackendOwned || fieldEditorState.isComposing)
		) {
			syncInlineAtomTargets();
			return;
		}
		if (!textSnapshot.exists) {
			elementRef.current.replaceChildren();
			previousRenderedDeltasSignatureRef.current = null;
			syncInlineAtomTargets();
			return;
		}
		fullReconcileDeltasToDOM(
			[...renderedDeltas],
			elementRef.current,
			editor.schema,
			{ preserveSelection: false },
		);
		previousRenderedDeltasSignatureRef.current = renderedDeltasSignature;
		syncInlineAtomTargets();
	}, [
		editor,
		isExpandedOwnedBlock,
		fieldEditorState.isComposing,
		fieldEditorState.domSyncVersion,
		fieldEditorState.activeBlockIds,
		fieldEditorState.mode,
		blockCommit,
		isActive,
		renderedDeltas,
		renderedDeltasSignature,
		renderedDeltasText,
		textSnapshot,
		inlineAtomRenderers,
	]);

	useLayoutEffect(() => {
		inlineAtomTargetsRef.current = inlineAtomTargets;
	}, [inlineAtomTargets]);

	const showPlaceholder =
		showDocumentPlaceholder ||
		showExplicitPlaceholder ||
		showBlockPlaceholder;
	const isActiveSurface = isActive && fieldEditorState.mode !== "expanded";

	const primitiveProps: Record<string, unknown> = {
		[DATA_ATTRS.inlineContent]: "",
		[DATA_ATTRS.fieldEditorSurface]: "",
		...fieldEditorTextEntryAttrs(isActiveSurface),
		className: getInlineContentClassName(
			className,
			emptyInlineCompletionText,
		),
		"data-suggestion-id": emptyInlineCompletionText
			? visibleInlineCompletion?.id
			: undefined,
		"data-suggestion-text": emptyInlineCompletionText ?? undefined,
		"data-suggestion-type": emptyInlineCompletionText
			? "inline"
			: undefined,
		"data-suggestion-placement": emptyInlineCompletionText
			? "after"
			: undefined,
		[DATA_ATTRS.placeholderVisible]: showPlaceholder ? "" : undefined,
		"data-placeholder": showPlaceholder ? placeholder : undefined,
		style: showPlaceholder
			? {
					position: "relative" as const,
				}
			: undefined,
	};
	return (
		<>
			{renderAsChild(
				{ ...rest, ref: elementRef },
				"span",
				primitiveProps,
			)}
			<InlineAtomPortalLayer
				editor={editor}
				blockId={blockId}
				targets={inlineAtomTargets}
				renderers={inlineAtomRenderers}
				selection={selection}
				interactions={inlineAtomInteractions}
				readonly={readonly}
			/>
		</>
	);
}

function getInlineContentClassName(
	className: string | undefined,
	emptyInlineCompletionText: string | null,
): string | undefined {
	if (!emptyInlineCompletionText) {
		return className;
	}
	return [className, "pen-ephemeral-suggestion"].filter(Boolean).join(" ");
}

function resolveSchemaPlaceholder(
	editor: Pick<Editor, "getBlock" | "schema">,
	blockId: string,
): string | undefined {
	const block = editor.getBlock(blockId);
	if (!block) return undefined;
	return editor.schema.resolve(block.type)?.placeholder;
}

function getDeltaText(
	deltas: readonly { insert: string | Record<string, unknown> }[],
): string {
	return deltas
		.map((delta) =>
			typeof delta.insert === "string"
				? delta.insert
				: getInlineNodeText(delta.insert),
		)
		.join("");
}

function getDeltaSignature(
	deltas: readonly {
		attributes?: Record<string, unknown>;
		insert: string | Record<string, unknown>;
	}[],
): string {
	return JSON.stringify(
		deltas.map((delta) => [delta.insert, delta.attributes ?? null]),
	);
}

function getInlineNodeText(insert: Record<string, unknown>): string {
	return INLINE_ATOM_REPLACEMENT_TEXT;
}
