import { IconSparkle, IconSpinner } from "../ui/Icon";
import type { ChatTurn } from "./useChat";

interface ChatTranscriptProps {
	turns: ChatTurn[];
	activity: string | null;
}

const EXAMPLE_PROMPTS = [
	"Turn the last paragraph into a bullet list",
	"Add a heading above the last paragraph",
	"Add a short closing paragraph",
];

export function ChatTranscript({ turns, activity }: ChatTranscriptProps) {
	if (turns.length === 0) {
		return <ChatEmptyState />;
	}

	const turnItems = turns.map((turn) => (
		<li key={turn.id} className="chat-turn">
			<p className="chat-prompt">{turn.prompt}</p>
			{turn.outcome ? (
				<p
					className="chat-outcome"
					data-failed={turn.isFailed || undefined}
				>
					{turn.outcome}
					{turn.route ? (
						<span className="chat-route">{turn.route}</span>
					) : null}
				</p>
			) : null}
		</li>
	));

	return (
		<ol className="chat-transcript">
			{turnItems}
			{activity ? (
				<li className="chat-activity">
					<span className="chat-activity-icon">
						<IconSpinner />
					</span>
					{activity}
				</li>
			) : null}
		</ol>
	);
}

function ChatEmptyState() {
	const promptItems = EXAMPLE_PROMPTS.map((prompt) => (
		<li key={prompt} className="chat-example">
			{prompt}
		</li>
	));

	return (
		<div className="chat-empty">
			<span className="chat-empty-icon">
				<IconSparkle size={20} />
			</span>
			<p className="chat-empty-title">Ask for an edit</p>
			<p className="chat-empty-body">
				The answer lands in the document, not here. This column keeps a
				receipt of what changed.
			</p>
			<ul className="chat-examples">{promptItems}</ul>
		</div>
	);
}
