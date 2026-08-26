import type { ReactNode } from "react";
import { AgentLoader } from "../ui/AgentLoader";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { Tile } from "../ui/Tile";
import type { ChatTurn } from "./useChat";

interface ChatTranscriptProps {
	turns: ChatTurn[];
	activity: string | null;
}

/**
 * What was asked, and what came of it.
 *
 * Laid out like Input's message list: the prompt is a tile, and the agent's
 * side is a status line rather than a bubble — because Pen's answer is the
 * document, not a reply. Only the newest turn can still be running, so the
 * activity line always belongs to the last one.
 */
export function ChatTranscript({ turns, activity }: ChatTranscriptProps) {
	const turnItems = turns.map((turn) => (
		<li key={turn.id} className="chat-turn">
			<Tile className="chat-prompt">{turn.prompt}</Tile>
			{turn.outcome === null ? (
				activity ? (
					<ChatStatus kind="loading" icon={<AgentLoader />}>
						{activity}
					</ChatStatus>
				) : null
			) : (
				<ChatStatus
					kind={turn.isFailed ? "failed" : "done"}
					icon={<Icon.Check />}
				>
					{turn.outcome}
					{turn.route ? (
						<Badge color="var(--palette-b40)">{turn.route}</Badge>
					) : null}
				</ChatStatus>
			)}
		</li>
	));

	return <ol className="chat-transcript">{turnItems}</ol>;
}

/**
 * Input's `AgentStatusText`: a mark, then a line that shimmers while it is
 * still true. While the agent is working the mark is the 3×3 IntelligenceLoader
 * (called `AgentLoader` here); when it is done, a check. The shimmer is one
 * gradient clipped to the glyphs.
 */
function ChatStatus({
	kind,
	icon,
	children,
}: {
	kind: "loading" | "done" | "failed";
	icon: ReactNode;
	children: ReactNode;
}) {
	return (
		<p className="chat-status" data-kind={kind}>
			<span className="chat-status-icon">{icon}</span>
			<span className="chat-status-body">{children}</span>
		</p>
	);
}
