import React from "react";
import type { AIContextualPromptAnchor, AISession } from "@pen/ai";
import { domSelectionToEditor } from "../../field-editor/selectionBridge";
import { useAISessionActions } from "../../hooks/useAISessionActions";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { resolvePromptHostElement, selectionMatchesSnapshot } from "./contextualPromptGeometry";
import { useContextualPromptSession } from "./contextualPromptPlacement";
import { useAIContext } from "./root";

export interface AIContextualPromptComposerProps extends AsChildProps {
	placeholder?: string;
	autoFocus?: boolean;
	ref?: React.Ref<HTMLElement>;
}

export function AIContextualPromptComposer(
	props: AIContextualPromptComposerProps,
) {
	const { placeholder = "Edit selection", autoFocus = true, ref, ...rest } = props;
	const { editor, state } = useAIContext();
	const session = useContextualPromptSession(editor);
	const actions = useAISessionActions(editor);
	const inputRef = React.useRef<HTMLTextAreaElement | null>(null);
	const isRunningCurrentSession =
		state.activeGeneration?.sessionId != null &&
		state.activeGeneration.sessionId === session?.id &&
		state.activeGeneration.status === "streaming";
	const sessionTurns = session?.turns ?? [];
	const activeTurnId =
		state.activeGeneration?.turnId ?? session?.activeTurnId ?? null;
	const draftPrompt = session?.contextualPrompt?.composer.draftPrompt ?? "";
	const hasSubmittedPrompt = sessionTurns.length > 0;
	const latestTurnId = sessionTurns[sessionTurns.length - 1]?.id ?? null;

	const focusComposerInput = React.useCallback(() => {
		const input = inputRef.current;
		if (!input) {
			return false;
		}
		if (input.ownerDocument.activeElement !== input) {
			input.focus({ preventScroll: true });
		}
		const endOffset = input.value.length;
		input.setSelectionRange(endOffset, endOffset);
		return input.ownerDocument.activeElement === input;
	}, []);

	React.useLayoutEffect(() => {
		if (
			!autoFocus ||
			!session?.contextualPrompt?.composer.isOpen ||
			session.contextualPrompt.composer.openReason === "history"
		) {
			return;
		}
		let frameId = 0;
		let remainingAttempts = 3;

		const focusInput = () => {
			if (focusComposerInput()) {
				return;
			}
			if (remainingAttempts > 0) {
				remainingAttempts -= 1;
				frameId = window.requestAnimationFrame(focusInput);
			}
		};

		focusInput();
		return () => {
			window.cancelAnimationFrame(frameId);
		};
	}, [
		autoFocus,
		focusComposerInput,
		isRunningCurrentSession,
		latestTurnId,
		session?.contextualPrompt?.composer.openReason,
		session?.contextualPrompt?.composer.isOpen,
		session?.id,
	]);

	if (!session) {
		return null;
	}
	const sessionId = session.id;
	const selectionSnapshot = session.contextualPrompt?.anchor.selectionSnapshot ?? null;
	const sessionLabel = resolveInlineSessionLabel(session);
	const [targetState, setTargetState] = React.useState<"active" | "pinned">(
		"active",
	);
	const targetHint = resolveInlineSessionTargetHint(targetState);

	function handleActionPointerDown(event: React.PointerEvent) {
		event.preventDefault();
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextPrompt = draftPrompt.trim();
		if (!nextPrompt) {
			return;
		}
		focusComposerInput();
		void actions
			.runSessionPrompt(sessionId, nextPrompt, { target: "selection" })
			.finally(() => {
				window.requestAnimationFrame(() => {
					focusComposerInput();
				});
			});
	}

	function handleAcceptTurn(turnId: string) {
		const resolved = actions.resolveSessionTurn(sessionId, turnId, "accept");
		if (!resolved) {
			actions.resolveSession(sessionId, "accept");
		}
	}

	function handleRejectTurn(turnId: string) {
		const resolved = actions.resolveSessionTurn(sessionId, turnId, "reject");
		if (!resolved) {
			actions.resolveSession(sessionId, "reject");
		}
	}

	function handleDismiss() {
		if (isRunningCurrentSession) {
			actions.cancelSession(sessionId);
			return;
		}
		if (!hasSubmittedPrompt) {
			actions.cancelSession(sessionId);
			return;
		}
		const rejected = actions.rejectSession(sessionId);
		if (!rejected) {
			actions.cancelSession(sessionId);
		}
	}

	function handleComposerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
		if (event.key !== "Escape") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		handleDismiss();
	}

	React.useEffect(() => {
		if (!session.contextualPrompt?.composer.isOpen) {
			return;
		}

		const ownerDocument = inputRef.current?.ownerDocument ?? document;
		const handleDocumentKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			const currentEditorRoot = inputRef.current?.closest(
				"[data-pen-editor-root]",
			) as HTMLElement | null;
			const targetElement =
				event.target instanceof HTMLElement
					? event.target
					: event.target instanceof Node
						? event.target.parentElement
						: null;
			const targetEditorRoot = targetElement?.closest(
				"[data-pen-editor-root]",
			) as HTMLElement | null;
			if (
				currentEditorRoot &&
				targetEditorRoot &&
				targetEditorRoot !== currentEditorRoot
			) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation?.();
			handleDismiss();
		};

		ownerDocument.addEventListener("keydown", handleDocumentKeyDown, true);
		return () => {
			ownerDocument.removeEventListener("keydown", handleDocumentKeyDown, true);
		};
	}, [
		handleDismiss,
		session.contextualPrompt?.composer.isOpen,
	]);

	React.useEffect(() => {
		if (!session.contextualPrompt?.composer.isOpen) {
			setTargetState("active");
			return;
		}

		const ownerDocument = inputRef.current?.ownerDocument ?? document;
		const promptElement = inputRef.current?.closest(
			"[data-pen-ai-contextual-prompt], [data-pen-ai-inline-session]",
		) as HTMLElement | null;
		const hostElement = resolvePromptHostElement(editor, session);

		const updateTargetState = () => {
			const nextTargetState = resolveInlineSessionTargetState(
				ownerDocument,
				hostElement,
				promptElement,
				selectionSnapshot ?? undefined,
			);
			const liveSelection = ownerDocument.getSelection();
			const liveRange =
				liveSelection && liveSelection.rangeCount > 0
					? liveSelection.getRangeAt(0)
					: null;
			const liveCommonAncestor =
				liveRange?.commonAncestorContainer instanceof Element
					? liveRange.commonAncestorContainer
					: liveRange?.commonAncestorContainer?.parentElement ?? null;
			if (
				nextTargetState === "pinned" &&
				!hasSubmittedPrompt &&
				liveSelection &&
				!liveSelection.isCollapsed &&
				liveCommonAncestor &&
				!(promptElement?.contains(liveCommonAncestor) ?? false)
			) {
				actions.suspendInlineSession(sessionId);
				return;
			}
			setTargetState(nextTargetState);
		};

		updateTargetState();
		ownerDocument.addEventListener("selectionchange", updateTargetState);
		ownerDocument.addEventListener("focusin", updateTargetState, true);
		ownerDocument.addEventListener("focusout", updateTargetState, true);
		return () => {
			ownerDocument.removeEventListener("selectionchange", updateTargetState);
			ownerDocument.removeEventListener("focusin", updateTargetState, true);
			ownerDocument.removeEventListener("focusout", updateTargetState, true);
		};
	}, [
		actions,
		hasSubmittedPrompt,
		selectionSnapshot,
		session,
		session.contextualPrompt?.composer.isOpen,
		sessionId,
	]);

	const turnItems = sessionTurns.map((turn) => {
		const pendingChangeCount = turn.suggestionIds.length + turn.reviewItemIds.length;
		const isTurnRunning =
			state.activeGeneration?.sessionId === sessionId &&
			state.activeGeneration.turnId === turn.id &&
			state.activeGeneration.status === "streaming";
		const shouldShowTurnActions = turn.id === latestTurnId;
		const canResolveTurn =
			pendingChangeCount > 0 &&
			turn.status !== "accepted" &&
			turn.status !== "rejected";
		return (
			<div
				key={turn.id}
				data-pen-ai-contextual-prompt-turn=""
				data-pen-ai-inline-session-turn=""
				data-turn-id={turn.id}
				data-turn-status={turn.status}
				data-active-turn={turn.id === activeTurnId ? "" : undefined}
			>
				<div
					data-pen-ai-contextual-prompt-prompt=""
					data-pen-ai-inline-session-prompt=""
				>
					{turn.prompt}
				</div>
				<div
					data-pen-ai-contextual-prompt-turn-meta=""
					data-pen-ai-inline-session-turn-meta=""
				>
					<span
						data-pen-ai-contextual-prompt-turn-status=""
						data-pen-ai-inline-session-turn-status=""
					>
						{resolveInlineSessionTurnStatusLabel(
							turn.status,
							pendingChangeCount,
							isTurnRunning,
						)}
					</span>
					{shouldShowTurnActions ? (
						<div
							data-pen-ai-contextual-prompt-turn-actions=""
							data-pen-ai-inline-session-turn-actions=""
						>
							<button
								type="button"
								data-pen-ai-inline-session-turn-accept=""
								onPointerDown={handleActionPointerDown}
								onClick={() => handleAcceptTurn(turn.id)}
								disabled={!canResolveTurn || isTurnRunning}
							>
								Accept
							</button>
							<button
								type="button"
								data-pen-ai-inline-session-turn-reject=""
								onPointerDown={handleActionPointerDown}
								onClick={() => handleRejectTurn(turn.id)}
								disabled={!canResolveTurn}
							>
								Reject
							</button>
						</div>
					) : null}
				</div>
			</div>
		);
	});
	const defaultChildren = (
		<form
			data-pen-ai-contextual-prompt-form=""
			data-pen-ai-inline-session-form=""
			onSubmit={handleSubmit}
			onKeyDown={handleComposerKeyDown}
		>
			<div
				data-pen-ai-contextual-prompt-header=""
				data-pen-ai-inline-session-header=""
			>
				<div
					data-pen-ai-contextual-prompt-target=""
					data-pen-ai-inline-session-target=""
				>
					<div
						data-pen-ai-contextual-prompt-label=""
						data-pen-ai-inline-session-label=""
					>
						{sessionLabel}
					</div>
					<div
						data-pen-ai-contextual-prompt-target-hint=""
						data-pen-ai-inline-session-target-hint=""
						data-target-state={targetState}
					>
						{targetHint}
					</div>
				</div>
			</div>
			{turnItems.length > 0 ? (
				<div
					data-pen-ai-contextual-prompt-history=""
					data-pen-ai-inline-session-history=""
				>
					{turnItems}
				</div>
			) : null}
			<textarea
				ref={inputRef}
				data-pen-ai-contextual-prompt-input=""
				data-pen-ai-inline-session-input=""
				placeholder={placeholder}
				value={draftPrompt}
				onKeyDown={handleComposerKeyDown}
				onChange={(event) =>
					actions.updateContextualPromptDraft(sessionId, event.target.value)
				}
			/>
			<div
				data-pen-ai-contextual-prompt-controls=""
				data-pen-ai-inline-session-controls=""
			>
				<div data-pen-ai-inline-session-spacer="" />
				<button
					type="submit"
					data-pen-ai-inline-session-submit=""
					onPointerDown={handleActionPointerDown}
					disabled={draftPrompt.trim().length === 0 || isRunningCurrentSession}
				>
					{turnItems.length > 0 ? "Add follow-up" : "Run edit"}
				</button>
			</div>
		</form>
	);

	const composerProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...rest,
		ref,
		children: props.children ?? defaultChildren,
	};

	return renderAsChild(
		composerProps,
		"div",
		{
			"data-pen-ai-contextual-prompt-composer": "",
		},
	);
}

function resolveInlineSessionTurnStatusLabel(
	status: string,
	pendingChangeCount: number,
	isTurnRunning: boolean,
): string {
	if (isTurnRunning || status === "streaming") {
		return "Working";
	}
	if (status === "accepted") {
		return "Accepted";
	}
	if (status === "rejected") {
		return "Rejected";
	}
	if (status === "error") {
		return "Error";
	}
	if (pendingChangeCount > 0) {
		return `${pendingChangeCount} pending`;
	}
	return "Done";
}

function resolveInlineSessionLabel(session: AISession): string {
	if (session.target.kind !== "selection") {
		return "Inline edit";
	}
	return session.target.selection.isMultiBlock ? "Selected range" : "Selected text";
}

function resolveInlineSessionTargetState(
	ownerDocument: Document,
	hostElement: HTMLElement | null,
	promptElement: HTMLElement | null,
	snapshot: AIContextualPromptAnchor["selectionSnapshot"],
): "active" | "pinned" {
	if (!snapshot) {
		return "active";
	}
	const activeElement = ownerDocument.activeElement;
	if (promptElement && activeElement instanceof Node && promptElement.contains(activeElement)) {
		return "active";
	}
	if (!hostElement) {
		return "pinned";
	}
	const domSelection = domSelectionToEditor(hostElement);
	if (!domSelection) {
		return "pinned";
	}
	return selectionMatchesSnapshot(domSelection, snapshot) ? "active" : "pinned";
}

function resolveInlineSessionTargetHint(
	targetState: "active" | "pinned",
): string {
	return targetState === "active"
		? "AI target is active"
		: "Pinned to the original selection";
}
