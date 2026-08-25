import { useState } from "react";
import { ChatSidebar } from "./chat/ChatSidebar";
import { CollaborateModal } from "./collaboration/CollaborateModal";
import { useCollaboration } from "./collaboration/useCollaboration";
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
	const collaboration = useCollaboration();
	const editor = usePenEditor(collaboration.session);
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);

	if (!editor) {
		return null;
	}

	return (
		<div className="app-shell">
			<ChatSidebar editor={editor} />
			<EditorPane
				editor={editor}
				inspectorOpen={isInspectorOpen}
				collaborationLive={collaboration.session !== null}
				onOpenCollaborate={collaboration.openModal}
				onToggleInspector={() =>
					setIsInspectorOpen((isOpen) => !isOpen)
				}
			/>
			<InspectorSheet
				editor={editor}
				open={isInspectorOpen}
				onClose={() => setIsInspectorOpen(false)}
			/>
			<CollaborateModal
				open={collaboration.isModalOpen}
				defaultName={collaboration.defaultName}
				defaultRoom={collaboration.defaultRoom}
				live={collaboration.session !== null}
				onClose={collaboration.closeModal}
				onJoin={collaboration.join}
				onLeave={collaboration.leave}
			/>
		</div>
	);
}
