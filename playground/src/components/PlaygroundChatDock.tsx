import type { AISession } from "@pen/ai";
import type { Editor } from "@pen/types";
import { useAISessionActions, useAISessions } from "@pen/react";
import {
	useEffect,
	useRef,
	useState,
	type FormEvent,
} from "react";
import { DebugPanel } from "./DebugPanel";
import "./PlaygroundChatDock.css";

type PlaygroundChatDockProps = {
	editor: Editor;
	autocompleteEnabled: boolean;
	customCaretEnabled: boolean;
	onAutocompleteEnabledChange: (enabled: boolean) => void;
	onCustomCaretEnabledChange: (enabled: boolean) => void;
};

type PlaygroundChatMessageRole = "user" | "assistant";
type PlaygroundChatMessageStatus = "complete" | "streaming" | "error";
type PlaygroundDockPanel = "chat" | "debug";
type BottomChatTarget = "selection" | "block" | "document";

interface PlaygroundChatMessage {
	id: string;
	role: PlaygroundChatMessageRole;
	content: string;
	status: PlaygroundChatMessageStatus;
}

const DEFAULT_CHAT_PROMPT =
	"Write a story";
export function PlaygroundChatDock({
	editor,
	autocompleteEnabled,
	customCaretEnabled,
	onAutocompleteEnabledChange,
	onCustomCaretEnabledChange,
}: PlaygroundChatDockProps) {
	const sessionActions = useAISessionActions(editor);
	const sessions = useAISessions(editor);
	const bottomChatSessionIdRef = useRef<string | null>(null);
	const activeSubmitRequestIdRef = useRef(0);
	const transcriptRef = useRef<HTMLDivElement | null>(null);
	const [draft, setDraft] = useState(DEFAULT_CHAT_PROMPT);
	const [isStreaming, setIsStreaming] = useState(false);
	const [activePanel, setActivePanel] = useState<PlaygroundDockPanel>("chat");
	const [lastError, setLastError] = useState<string | null>(null);
	const latestBottomChatSession = sessions
		.filter((session) => session.surface === "bottom-chat")
		.slice()
		.sort((left, right) => left.createdAt - right.createdAt)
		.at(-1) ?? null;
	const activeBottomChatSessionId =
		bottomChatSessionIdRef.current ?? latestBottomChatSession?.id ?? null;

	const bottomChatSession =
		sessions.find((session) => session.id === activeBottomChatSessionId) ?? null;
	const bottomChatMessages = buildBottomChatMessages(sessions, lastError);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const prompt = draft.trim();
		if (!prompt || isStreaming) {
			return;
		}

		setIsStreaming(true);
		setLastError(null);
		setDraft("");
		const submitRequestId = activeSubmitRequestIdRef.current + 1;
		activeSubmitRequestIdRef.current = submitRequestId;

		try {
			const submitTarget = resolveBottomChatTarget(editor, prompt);
			let sessionId = activeBottomChatSessionId;
			if (
				sessionId &&
				!sessionActions.canReuseSessionPrompt(sessionId, prompt, {
					target: submitTarget,
				})
			) {
				sessionId = null;
				bottomChatSessionIdRef.current = null;
			}
			if (!sessionId) {
				const session = sessionActions.startSession({
					surface: "bottom-chat",
					target: submitTarget,
				});
				sessionId = session?.id ?? null;
				bottomChatSessionIdRef.current = sessionId;
			}
			if (!sessionId) {
				throw new Error("Unable to start a bottom chat AI session.");
			}

			const generation = await sessionActions.runSessionPrompt(sessionId, prompt, {
				target: submitTarget,
			});
			if (activeSubmitRequestIdRef.current !== submitRequestId) {
				return;
			}
			const reviewItemCount = generation?.reviewItems?.length ?? 0;
			const suggestionCount = generation?.suggestionIds?.length ?? 0;
			const receiptStatus = generation?.mutationReceipt?.status ?? null;
			void reviewItemCount;
			void suggestionCount;
			void receiptStatus;
		} catch (error) {
			if (activeSubmitRequestIdRef.current !== submitRequestId) {
				return;
			}
			const message =
				error instanceof Error ? error.message : "The playground agent failed.";
			setLastError(message);
		} finally {
			if (activeSubmitRequestIdRef.current === submitRequestId) {
				setIsStreaming(false);
			}
		}
	};

	const handleStop = () => {
		activeSubmitRequestIdRef.current += 1;
		const sessionId = bottomChatSessionIdRef.current;
		if (sessionId) {
			sessionActions.cancelSession(sessionId);
		}
		bottomChatSessionIdRef.current = null;
		setIsStreaming(false);
	};

	useEffect(() => {
		const transcript = transcriptRef.current;
		if (!transcript) {
			return;
		}

		transcript.scrollTop = transcript.scrollHeight;
	}, [bottomChatMessages]);

	useEffect(() => {
		if (!bottomChatSession || !bottomChatSessionIdRef.current) {
			return;
		}
		if (bottomChatSession.status === "cancelled") {
			bottomChatSessionIdRef.current = null;
			setIsStreaming(false);
			return;
		}
		if (bottomChatSession.status !== "error") {
			return;
		}

		bottomChatSessionIdRef.current = null;
		setIsStreaming(false);
	}, [bottomChatSession]);

	const switcherButtons = (
		<div className="playground-chat-switcher" role="tablist" aria-label="AI dock views">
			<button
				className="playground-chat-switcher-button"
				type="button"
				role="tab"
				aria-selected={activePanel === "chat"}
				data-active={activePanel === "chat" ? "" : undefined}
				onClick={() => setActivePanel("chat")}
			>
				<h3>Chat</h3>
			</button>
			<button
				className="playground-chat-switcher-button"
				type="button"
				role="tab"
				aria-selected={activePanel === "debug"}
				data-active={activePanel === "debug" ? "" : undefined}
				onClick={() => setActivePanel("debug")}
			>
				<h3>Debug</h3>
			</button>
		</div>
	);
	const chatMessageItems = bottomChatMessages.map((message) => {
		return (
			<article
				key={message.id}
				className="playground-chat-message"
				data-role={message.role}
				data-status={message.status}
			>
				<div className="playground-chat-message-meta">
					<span
						className="playground-chat-message-role"
						data-role={message.role}
					>
						{message.role === "user" ? "You" : "Agent"}
					</span>
				</div>
				<div className="playground-chat-message-body">
					{message.content || (message.role === "assistant" ? "Thinking..." : "")}
				</div>
			</article>
		);
	});

	return (
		<section
			className="playground-chat-shell"
			data-pen-ignore-pointer-gesture=""
		>
			<div className="playground-chat-toolbar">
				{switcherButtons}
			</div>
			<div className="playground-chat-window">
				{activePanel === "chat" ? (
					<>
						<div className="playground-chat-transcript" ref={transcriptRef}>
							{chatMessageItems}
						</div>

						<form className="playground-chat-form" onSubmit={handleSubmit}>
							<div className="playground-chat-composer">
								<textarea
									id="playground-agent-chat"
									className="playground-chat-input"
									value={draft}
									onChange={(event) => setDraft(event.target.value)}
									placeholder="Do anything with AI..."
								/>
								<div className="playground-chat-actions">
									<div className="playground-chat-button-row">
										{isStreaming ? (
											<button
												className="toolbar-button playground-chat-secondary-button"
												type="button"
												onClick={handleStop}
											>
												Stop
											</button>
										) : null}
										<button
											className="toolbar-button playground-chat-primary-button"
											type="submit"
											disabled={!draft.trim() || isStreaming}
										>
											Send
										</button>
									</div>
								</div>
							</div>
							{lastError ? (
								<div className="playground-chat-error">{lastError}</div>
							) : null}
						</form>
					</>
				) : (
					<div className="playground-chat-debug-view">
						<DebugPanel
							editor={editor}
							sessionId={bottomChatSession?.id ?? activeBottomChatSessionId ?? undefined}
							autocompleteEnabled={autocompleteEnabled}
							customCaretEnabled={customCaretEnabled}
							onAutocompleteEnabledChange={onAutocompleteEnabledChange}
							onCustomCaretEnabledChange={onCustomCaretEnabledChange}
							variant="dock"
						/>
					</div>
				)}
			</div>
		</section>
	);
}

function resolveBottomChatTarget(
	editor: Editor,
	prompt: string,
): BottomChatTarget {
	const normalizedPrompt = prompt.trim().toLowerCase();
	const hasExpandedTextSelection =
		editor.selection?.type === "text" && !editor.selection.isCollapsed;
	if (isDocumentWideChatPrompt(normalizedPrompt)) {
		return "document";
	}
	if (hasExpandedTextSelection && isSelectionScopedChatPrompt(normalizedPrompt)) {
		return "selection";
	}
	if (isBlockScopedChatPrompt(normalizedPrompt)) {
		return "block";
	}
	return "document";
}

function isSelectionScopedChatPrompt(prompt: string): boolean {
	return /\b(rewrite|retry|redo|again|summari[sz]e|translate|simplify|fix|improve|shorten|expand|polish|paraphrase)\b/i.test(
		prompt,
	);
}

function isBlockScopedChatPrompt(prompt: string): boolean {
	return /\b(rewrite|retry|redo|again|continue|finish|complete|fix|improve|shorten|expand|polish|paraphrase)\b/i.test(
		prompt,
	);
}

function isDocumentWideChatPrompt(prompt: string): boolean {
	return (
		/\b(remove|delete|clear|erase|wipe|rewrite|replace|write|create|draft|compose|generate)\b/i.test(
			prompt,
		) &&
		/\b(all|entire|whole|document|content|contents|story|page)\b/i.test(prompt)
	);
}

function buildBottomChatMessages(
	sessions: readonly AISession[],
	lastError: string | null,
): readonly PlaygroundChatMessage[] {
	const bottomChatSessions = sessions
		.filter((session) => session.surface === "bottom-chat")
		.slice()
		.sort((left, right) => left.createdAt - right.createdAt);
	const messages: PlaygroundChatMessage[] = [];

	for (const session of bottomChatSessions) {
		const sessionTurnMessages = session.turns
			.slice()
			.sort((left, right) => left.createdAt - right.createdAt)
			.flatMap((turn) => {
				const assistantStatus: PlaygroundChatMessageStatus =
					turn.status === "streaming"
						? "streaming"
						: turn.status === "error"
							? "error"
							: "complete";
				const assistantContent = describeBottomChatTurnResult(turn, lastError);
				return [
					{
						id: `${turn.id}:user`,
						role: "user" as const,
						content: turn.prompt,
						status: "complete" as const,
					},
					{
						id: `${turn.id}:assistant`,
						role: "assistant" as const,
						content: assistantContent,
						status: assistantStatus,
					},
				];
			});
		messages.push(...sessionTurnMessages);
	}

	return messages;
}

function describeBottomChatTurnResult(
	turn: AISession["turns"][number],
	lastError: string | null,
): string {
	if (turn.status === "streaming") {
		return "Writing in the editor...";
	}
	if (turn.status === "cancelled") {
		return "Stopped.";
	}
	if (turn.status === "error") {
		return lastError ?? "The playground agent failed.";
	}
	if (turn.reviewItemIds.length > 0) {
		return "Staged changes for review.";
	}
	if (turn.suggestionIds.length > 0) {
		return "Staged suggestions in the editor.";
	}
	if (turn.status === "accepted") {
		return "Wrote to the editor.";
	}
	if (turn.generatedBlockIds.length > 0) {
		return "Wrote to the editor.";
	}
	return "No changes were produced.";
}
