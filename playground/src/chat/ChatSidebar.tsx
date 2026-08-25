import type { Editor } from "@input/pen-types";
import { ChatComposer } from "./ChatComposer";
import { ChatTranscript } from "./ChatTranscript";
import { useChat } from "./useChat";

/**
 * The left column: ask for an edit, watch the document change.
 *
 * Pen ships no chat component. It exposes the AI state and the actions, and
 * the UI is entirely yours — this one is about a hundred lines across three
 * files.
 */
export function ChatSidebar({ editor }: { editor: Editor }) {
	const chat = useChat(editor);

	return (
		<aside className="chat-sidebar" aria-label="Assistant">
			<header className="chat-header">
				<h1 className="chat-title">Assistant</h1>
			</header>
			<div className="chat-scroll">
				<ChatTranscript turns={chat.turns} activity={chat.activity} />
			</div>
			<ChatComposer
				isBusy={chat.isBusy}
				onSend={chat.send}
				onStop={chat.stop}
			/>
		</aside>
	);
}
