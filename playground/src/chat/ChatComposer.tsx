import { useState, type KeyboardEvent } from "react";
import { IconArrowUp } from "../ui/Icon";

interface ChatComposerProps {
	isBusy: boolean;
	onSend: (prompt: string) => void;
	onStop: () => void;
}

export function ChatComposer({ isBusy, onSend, onStop }: ChatComposerProps) {
	const [draft, setDraft] = useState("");

	const canSend = draft.trim().length > 0 && !isBusy;

	const submit = () => {
		if (!canSend) {
			return;
		}
		onSend(draft);
		setDraft("");
	};

	// Enter sends, Shift+Enter starts a new line.
	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	};

	return (
		<form
			className="chat-composer"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<textarea
				className="chat-input"
				value={draft}
				rows={2}
				placeholder="Ask for an edit…"
				aria-label="Ask for an edit"
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={handleKeyDown}
			/>
			{isBusy ? (
				<button type="button" className="chat-send" onClick={onStop}>
					Stop
				</button>
			) : (
				<button
					type="submit"
					className="chat-send"
					disabled={!canSend}
					aria-label="Send message"
				>
					<IconArrowUp />
				</button>
			)}
		</form>
	);
}
