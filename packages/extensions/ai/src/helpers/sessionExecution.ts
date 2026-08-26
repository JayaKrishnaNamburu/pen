import { selectionToRange } from "@input/pen-core";
import { generateId, type Editor } from "@input/pen-types";
import {
	isDocumentFollowUpEditPrompt,
	isDocumentResetPrompt,
} from "../runtime/promptTargeting";
import { classifyPromptIntent } from "../runtime/router";
import type {
	AIRequestedOperation,
	AISession,
	AISessionMetrics,
	CommitDebugState,
	GenerationState,
} from "../types";
import { appendUniqueString } from "./equality";
import type { GenerationTarget } from "./types";
import {
	resolveSessionAnchor,
	resolveSessionSelectionSnapshot,
} from "./types";

export function buildSessionExecutionPrompt(
	session: AISession | null,
	prompt: string,
): string {
	if (!session) {
		return prompt;
	}
	const previousPrompts = session.promptHistory
		.map((item) => item.prompt.trim())
		.filter((item) => item.length > 0)
		.slice(-4);
	if (previousPrompts.length === 0) {
		return prompt;
	}
	const historyLines = previousPrompts.map(
		(previousPrompt, index) => `${index + 1}. ${previousPrompt}`,
	);
	const intro =
		session.surface === "inline-edit"
			? "You are continuing an existing inline editor edit session."
			: "You are continuing an existing editor chat session.";
	const applyInstruction =
		session.surface === "inline-edit"
			? "Apply the latest request to the current selected document state."
			: "Apply the latest request to the current document state.";
	return [
		intro,
		"Earlier user requests in this same session:",
		...historyLines,
		"",
		applyInstruction,
		"Latest request:",
		prompt,
	].join("\n");
}

export function createDefaultSessionCommitMetrics(): AISessionMetrics["commit"] {
	return {
		attemptCount: 0,
		selectionReplacementCount: 0,
		scopedReplacementCount: 0,
		plainMarkdownCount: 0,
		failedCount: 0,
	};
}

export function accumulateSessionCommitMetrics(
	current: AISessionMetrics["commit"] | undefined,
	commit: CommitDebugState | undefined,
): AISessionMetrics["commit"] {
	const next = {
		...(current ?? createDefaultSessionCommitMetrics()),
	};
	if (!commit?.attempted) {
		return next;
	}
	next.attemptCount += 1;
	switch (commit.executionPath) {
		case "selection-replacement":
			next.selectionReplacementCount += 1;
			return next;
		case "scoped-replacement":
			next.scopedReplacementCount += 1;
			return next;
		case "plain-markdown":
			next.plainMarkdownCount += 1;
			return next;
		default:
			next.failedCount += 1;
			return next;
	}
}

function shouldCloseInlineSessionPrompt(session: AISession): boolean {
	return (
		session.surface === "inline-edit" && session.contextualPrompt != null
	);
}

export function closeInlineSessionPrompt(
	session: AISession,
): AISession["contextualPrompt"] | undefined {
	if (!shouldCloseInlineSessionPrompt(session) || !session.contextualPrompt) {
		return session.contextualPrompt;
	}

	return {
		...session.contextualPrompt,
		composer: {
			...session.contextualPrompt.composer,
			isOpen: false,
			isSubmitting: false,
		},
	};
}

export function resolvePreviousGeneratedBlockIds(session: AISession): string[] {
	const completedTurns = session.turns.filter(
		(turn) => turn.status === "complete" || turn.status === "accepted",
	);
	const lastTurnWithBlocks = completedTurns
		.slice()
		.reverse()
		.find((turn) => turn.generatedBlockIds.length > 0);
	return lastTurnWithBlocks?.generatedBlockIds ?? [];
}

export function shouldReplacePreviousGeneratedBlocks(
	session: AISession,
	prompt: string,
): boolean {
	return (
		session.surface === "bottom-chat" &&
		session.target.kind === "document" &&
		(classifyPromptIntent(prompt) === "rewrite" ||
			isDocumentResetPrompt(prompt) ||
			isDocumentFollowUpEditPrompt(prompt))
	);
}

export function resolveReplacementDeleteBlockIds(
	editor: Editor,
	blockId: string,
	replaceBlockIds?: readonly string[],
): string[] {
	const requestedIds =
		replaceBlockIds && replaceBlockIds.length > 0
			? replaceBlockIds
			: [blockId];
	const deleteBlockIds = requestedIds.filter(
		(candidateBlockId, index, allBlockIds) =>
			allBlockIds.indexOf(candidateBlockId) === index &&
			editor.getBlock(candidateBlockId) != null,
	);
	return deleteBlockIds.length > 0 ? deleteBlockIds : [blockId];
}

export interface GenerationSessionHost {
	_editor: Editor;
	_updateSession(sessionId: string, patch: Partial<AISession>): void;
}

export function beginGenerationSession(
	controller: GenerationSessionHost,
	input: {
		sessionId: string;
		seedGeneration: GenerationState;
		prompt: string;
		target: GenerationTarget;
		operation: AIRequestedOperation | null;
		sessionTurnId: string | undefined;
		existingSession: AISession | null;
	},
): void {
	const {
		sessionId,
		seedGeneration,
		prompt,
		target,
		operation,
		sessionTurnId,
		existingSession,
	} = input;
	const nextSelectionSnapshot =
		target.type === "selection"
			? resolveSessionSelectionSnapshot(
					controller._editor,
					target.selection,
				)
			: undefined;
	controller._updateSession(sessionId, {
		status: "streaming",
		operation,
		activeTurnId: sessionTurnId,
		anchor:
			target.type === "selection"
				? resolveSessionAnchor(controller._editor, target.selection)
				: resolveSessionAnchor(
						controller._editor,
						controller._editor.selection,
					),
		generationIds: appendUniqueString(
			existingSession?.generationIds ?? [],
			seedGeneration.id,
		),
		promptHistory: [
			...(existingSession?.promptHistory ?? []),
			{
				id: generateId(),
				prompt,
				createdAt: Date.now(),
				generationId: seedGeneration.id,
				operation: operation ?? undefined,
			},
		],
		turns: sessionTurnId
			? [
					...(existingSession?.turns ?? []),
					{
						id: sessionTurnId,
						prompt,
						createdAt: Date.now(),
						undoGroupId: seedGeneration.undoGroupId,
						generationId: seedGeneration.id,
						target: target.type,
						operation: operation ?? undefined,
						status: "streaming",
						suggestionIds: [],
						generatedBlockIds: [],
						anchor:
							target.type === "selection"
								? resolveSessionAnchor(
										controller._editor,
										target.selection,
									)
								: undefined,
						selection:
							target.type === "selection"
								? resolveSessionSelectionSnapshot(
										controller._editor,
										target.selection,
									)
								: undefined,
					},
				]
			: existingSession?.turns,
		contextualPrompt: existingSession?.contextualPrompt
			? {
					...existingSession.contextualPrompt,
					anchor:
						target.type === "selection"
							? {
									...existingSession.contextualPrompt.anchor,
									selectionSnapshot: nextSelectionSnapshot,
									focusBlockId: selectionToRange(
										controller._editor.internals.doc,
										target.selection,
									).start.blockId,
									status: "valid",
								}
							: existingSession.contextualPrompt.anchor,
					composer: {
						...existingSession.contextualPrompt.composer,
						draftPrompt: "",
						isSubmitting: true,
						isOpen: true,
						openReason: "user",
					},
				}
			: undefined,
	});
}
