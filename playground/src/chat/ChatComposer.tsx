import { useState, type KeyboardEvent } from "react";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Tile } from "../ui/Tile";

interface ChatComposerProps {
	busy: boolean;
	onSend: (prompt: string) => void;
	onStop: () => void;
}

/**
 * The prompt field, in a tile — the same arrangement as Input's agent input: the
 * text on top, the actions on a row beneath it, the card's edge tightening while
 * you type in it.
 */
export function ChatComposer({ busy, onSend, onStop }: ChatComposerProps) {
	const [draft, setDraft] = useState("");

	const canSend = draft.trim().length > 0 && !busy;

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
		<Tile className="chat-composer">
			<form
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
				<div className="chat-composer-actions">
					{busy ? (
						<Button.Tooltip content="Stop" side="top">
							<Button.Icon
								label="Stop"
								kind="primary"
								onClick={onStop}
							>
								<Icon.Stop />
							</Button.Icon>
						</Button.Tooltip>
					) : (
						<Button.Tooltip
							content="Send"
							shortcut="Enter"
							side="top"
						>
							<Button.Icon
								label="Send"
								kind="primary"
								type="submit"
								disabled={!canSend}
							>
								<Icon.ArrowUp />
							</Button.Icon>
						</Button.Tooltip>
					)}
				</div>
			</form>
		</Tile>
	);
}
