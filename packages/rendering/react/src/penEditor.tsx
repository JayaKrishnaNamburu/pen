import React from "react";
import { EditorRoot, type EditorRootProps } from "./primitives/editor/root";
import {
	EditorContent,
	type EditorContentProps,
} from "./primitives/editor/content";
import { EditorCaretOverlay } from "./primitives/editor/caretOverlay";

export interface PenEditorProps
	extends
		Omit<EditorRootProps, "children">,
		Omit<EditorContentProps, "children"> {
	children?: React.ReactNode;
	customCaret?: boolean;
}

export function PenEditor(props: PenEditorProps) {
	const {
		editor,
		readonly,
		importers,
		assets,
		renderers,
		editorViewMode,
		interactionModel,
		emptyPlaceholder,
		children,
		customCaret = false,
		chrome,
		...rest
	} = props;

	return (
		<EditorRoot
			key={editor.internals.viewId}
			editor={editor}
			readonly={readonly}
			importers={importers}
			assets={assets}
			renderers={renderers}
			editorViewMode={editorViewMode}
			interactionModel={interactionModel}
			chrome={chrome}
		>
			<EditorContent emptyPlaceholder={emptyPlaceholder} {...rest}>
				{children}
			</EditorContent>
			{customCaret ? <EditorCaretOverlay /> : null}
		</EditorRoot>
	);
}
