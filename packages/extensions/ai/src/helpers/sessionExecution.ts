import type { Editor } from "@input/pen-types";
import {
	isDocumentFollowUpEditPrompt,
	isDocumentResetPrompt,
} from "../runtime/promptTargeting";
import { classifyPromptIntent } from "../runtime/router";
import type { AISession, AISessionMetrics, CommitDebugState } from "../types";

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
