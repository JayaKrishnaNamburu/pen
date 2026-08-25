import { Pen } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import { FormatToolbar } from "./FormatToolbar";
import { SlashMenu } from "./SlashMenu";

interface EditorPaneProps {
	editor: Editor;
	isInspectorOpen: boolean;
	onToggleInspector: () => void;
}

/**
 * The middle column: a toolbar above the document.
 *
 * `Pen.Editor.Root` owns the editing surface — focus, selection, keyboard, and
 * clipboard — and `Pen.Editor.Content` renders the blocks. Both are unstyled;
 * everything you see comes from `editor.css`.
 */
export function EditorPane({
	editor,
	isInspectorOpen,
	onToggleInspector,
}: EditorPaneProps) {
	return (
		<main className="editor-pane">
			<FormatToolbar
				editor={editor}
				isInspectorOpen={isInspectorOpen}
				onToggleInspector={onToggleInspector}
			/>
			<div className="editor-scroll">
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content emptyPlaceholder="Write something, or ask the assistant on the left." />
					<SlashMenu editor={editor} />
				</Pen.Editor.Root>
			</div>
		</main>
	);
}
