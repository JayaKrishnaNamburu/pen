import { Icon } from "../ui/Icon";
import { Tile } from "../ui/Tile";

interface ChatEmptyProps {
	onSend: (prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
	"Turn the last paragraph into a bullet list",
	"Add a heading above the last paragraph",
	"Add a short closing paragraph",
];

/**
 * The column before anything is asked: a mark, a question, and three example
 * prompts, centred. The composer lives at the bottom of the panel, not here.
 *
 * The examples are tiles rather than buttons because they are content you pick,
 * not commands you fire.
 */
export function ChatEmpty({ onSend }: ChatEmptyProps) {
	const promptTiles = EXAMPLE_PROMPTS.map((prompt) => (
		<Tile.Button
			key={prompt}
			className="chat-suggestion"
			onClick={() => onSend(prompt)}
		>
			{prompt}
		</Tile.Button>
	));

	return (
		<div className="chat-empty">
			<span className="chat-empty-mark">
				<Icon.PenMagic size={36} />
			</span>
			<h2>What should Pen write?</h2>
			<div className="chat-suggestions">{promptTiles}</div>
		</div>
	);
}
