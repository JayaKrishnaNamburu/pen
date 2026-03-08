import React, { useRef, useLayoutEffect } from "react";
import { useEditorContext } from "../../context/editorContext.js";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import { fullReconcileDeltasToDOM } from "../../field-editor/reconciler.js";
import { useBlockEditingState } from "../../hooks/useBlockEditingState.js";
import { useBlockCommitState } from "../../hooks/useBlockCommitState.js";
import { useBlockTextSnapshot } from "../../hooks/useBlockTextSnapshot.js";
import { useFieldEditorState } from "../../hooks/useFieldEditorState.js";
import { renderAsChild, type AsChildProps } from "../../utils/asChild.js";
import { DATA_ATTRS } from "../../utils/dataAttributes.js";

export interface InlineContentProps extends AsChildProps {
	blockId: string;
	placeholder?: string;
	ref?: React.Ref<HTMLElement>;
}

export function InlineContent(props: InlineContentProps) {
	const { blockId, placeholder, ...rest } = props;
	const { editor } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const isActive = useBlockEditingState(fieldEditor, blockId);
	const blockCommit = useBlockCommitState(editor, blockId);
	const textSnapshot = useBlockTextSnapshot(editor, blockId);
	const elementRef = useRef<HTMLElement>(null);
	const previousCommitRevisionRef = useRef(blockCommit.revision);
	const isExpandedOwnedBlock =
		fieldEditorState.mode === "expanded" &&
		fieldEditorState.activeBlockIds.includes(blockId);

	useLayoutEffect(() => {
		if (fieldEditorState.mode === "expanded") {
			return;
		}
		if (isActive && elementRef.current && fieldEditor) {
			fieldEditor.attachElement(elementRef.current);
		}
	}, [isActive, fieldEditor, fieldEditorState.mode, blockId]);

	useLayoutEffect(() => {
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
			didCommitAdvance && blockCommit.origin === "history";

		if (isExpandedOwnedBlock || isActive) {
			return;
		}
		if (!elementRef.current) {
			return;
		}
		if (
			!shouldForceCommitReconcile &&
			(isBackendOwned || fieldEditorState.isComposing)
		) {
			return;
		}
		if (!textSnapshot.exists) {
			elementRef.current.replaceChildren();
			return;
		}
		fullReconcileDeltasToDOM(
			[...textSnapshot.deltas],
			elementRef.current,
			editor.schema,
			{ preserveSelection: false },
		);
	}, [
		editor,
		isExpandedOwnedBlock,
		fieldEditorState.isComposing,
		fieldEditorState.activeBlockIds,
		fieldEditorState.mode,
		blockCommit,
		isActive,
		textSnapshot,
	]);

	const isEmpty = !textSnapshot.text || textSnapshot.text === "\u200B";
	const showPlaceholder = isEmpty && placeholder;

	const primitiveProps: Record<string, unknown> = {
		[DATA_ATTRS.inlineContent]: "",
		"data-placeholder-visible": showPlaceholder ? "" : undefined,
		"data-placeholder": placeholder,
		style: showPlaceholder
			? {
					position: "relative" as const,
				}
			: undefined,
	};

	return renderAsChild({ ...rest, ref: elementRef }, "span", primitiveProps);
}
