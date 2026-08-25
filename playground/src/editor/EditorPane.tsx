import { Pen } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import { FormatToolbar } from "./FormatToolbar";
import { ReviewSurface } from "./ReviewSurface";
import { SlashMenu } from "./SlashMenu";

interface EditorPaneProps {
	editor: Editor;
	inspectorOpen: boolean;
	collaborationLive: boolean;
	onOpenCollaborate: () => void;
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
	inspectorOpen,
	collaborationLive,
	onOpenCollaborate,
	onToggleInspector,
}: EditorPaneProps) {
	return (
		<main className="editor-pane">
			<FormatToolbar
				editor={editor}
				inspectorOpen={inspectorOpen}
				collaborationLive={collaborationLive}
				onOpenCollaborate={onOpenCollaborate}
				onToggleInspector={onToggleInspector}
			/>
			<ReviewSurface editor={editor}>
				<div className="editor-scroll">
					{/*
					 * `Pen.Editor.Root` binds a field editor and a rendered DOM tree
					 * to one editor instance for its whole lifetime. Joining or
					 * leaving a room replaces the instance, so the surface is keyed
					 * to force a fresh mount instead of leaving the old field editor
					 * projecting DOM selections into a document it no longer knows.
					 */}
					<Pen.Editor.Root
						editor={editor}
						key={editor.internals.viewId}
					>
						<Pen.Editor.Content emptyPlaceholder="Write something, or ask the agent on the left." />
						{collaborationLive ? (
							<Pen.Multiplayer.CaretOverlay />
						) : null}
						<SlashMenu editor={editor} />
					</Pen.Editor.Root>
				</div>
			</ReviewSurface>
		</main>
	);
}
