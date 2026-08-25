import { useState } from "react";
import { ChatSidebar } from "./chat/ChatSidebar";
import { EditorPane } from "./editor/EditorPane";
import { usePenEditor } from "./editor/usePenEditor";
import { InspectorSheet } from "./inspector/InspectorSheet";

/**
 * Three panes over one editor: chat on the left, document in the middle,
 * inspector on the right.
 *
 * All three read and write the same `Editor` instance. The chat does not send
 * text to the editor and the inspector does not receive copies of the document
 * — they both talk to the editor directly, which is why they never disagree.
 */
export function App() {
	const editor = usePenEditor();
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);

	if (!editor) {
		return null;
	}

	return (
		<div className="app-shell">
			<ChatSidebar editor={editor} />
			<EditorPane
				editor={editor}
				isInspectorOpen={isInspectorOpen}
				onToggleInspector={() =>
					setIsInspectorOpen((isOpen) => !isOpen)
				}
			/>
			<InspectorSheet
				editor={editor}
				isOpen={isInspectorOpen}
				onClose={() => setIsInspectorOpen(false)}
			/>
		</div>
	);
}
