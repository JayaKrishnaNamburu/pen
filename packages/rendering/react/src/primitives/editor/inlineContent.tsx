import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import { useEditorContext } from "../../context/editorContext.js";
import { useFieldEditorContext } from "../../context/fieldEditorContext.js";
import {
	applyDeltaToDOM,
	fullReconcileToDOM,
} from "../../field-editor/reconciler.js";
import { useBlockEditingState } from "../../hooks/useBlockEditingState.js";
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
	const elementRef = useRef<HTMLElement>(null);
	const [isEmpty, setIsEmpty] = useState(false);

	useLayoutEffect(() => {
		if (fieldEditorState.mode === "expanded") {
			return;
		}
		if (isActive && elementRef.current && fieldEditor) {
			fieldEditor.attachElement(elementRef.current);
		}
	}, [isActive, fieldEditor, fieldEditorState.mode, blockId]);

	useEffect(() => {
		if (fieldEditorState.mode === "expanded") {
			return;
		}
		if (isActive) {
			return;
		}

		const blockMap = getBlockMap(editor, blockId);
		const ytext = blockMap?.get("content");
		if (!ytext) return;

		const syncProjection = () => {
			const text = ytext.toString();
			setIsEmpty(!text || text === "\u200B");
			if (elementRef.current) {
				fullReconcileToDOM(ytext, elementRef.current, editor.schema);
			}
		};

		syncProjection();

		const handler = (event: { delta?: unknown[] }) => {
			const text = ytext.toString();
			setIsEmpty(!text || text === "\u200B");

			if (!elementRef.current) {
				return;
			}

			const applied =
				event.delta != null &&
				applyDeltaToDOM(
					event.delta as any,
					elementRef.current,
					editor.schema,
				);

			if (!applied) {
				fullReconcileToDOM(ytext, elementRef.current, editor.schema);
			}
		};

		ytext.observe(handler);
		return () => ytext.unobserve(handler);
	}, [editor, blockId, fieldEditorState.mode, isActive]);

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

function getBlockMap(
	editor: ReturnType<typeof useEditorContext>["editor"],
	blockId: string,
) {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw(doc) as any;
	return ydoc.getMap("blocks").get(blockId);
}
