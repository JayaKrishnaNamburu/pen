import type { AIWorkingSetEnvelope } from "../types";
import type { AITargetKind } from "./contracts";

/**
 * What kind of thing a generation is aimed at. This outlived the structured
 * planner it used to share a module with (`spec/rules/ai.md` UC3): the
 * router needs the target kind to pick a lane, and that has nothing to do with
 * planning.
 */
export function resolveGenerationTargetKind(options: {
	target: "selection" | "block";
	blockType: string | null;
	workingSet: AIWorkingSetEnvelope | null;
}): AITargetKind {
	if (options.target === "selection") {
		return "text";
	}

	const structuredKind = readWorkingSetNavigatorHints(
		options.workingSet?.context,
	).structuredTargetKind;
	if (structuredKind) {
		return structuredKind;
	}

	if (options.blockType === "table") {
		return "table";
	}
	return "block";
}

export interface WorkingSetNavigatorHints {
	selectedTextLength: number;
	activeBlockType: string | null;
	structuredTargetKind: AITargetKind | null;
}

/**
 * Fields the navigator needs from a `get_context` / `get_cursor_context`
 * payload. One reader so working-set methods do not recast the same shape.
 */
export function readWorkingSetNavigatorHints(
	context: unknown,
): WorkingSetNavigatorHints {
	if (!context || typeof context !== "object") {
		return {
			selectedTextLength: 0,
			activeBlockType: null,
			structuredTargetKind: null,
		};
	}
	const record = context as {
		selectedText?: unknown;
		activeBlockType?: unknown;
		structuredTarget?: {
			target?: {
				kind?: unknown;
			};
		} | null;
	};
	const kind = record.structuredTarget?.target?.kind;
	return {
		selectedTextLength:
			typeof record.selectedText === "string"
				? record.selectedText.length
				: 0,
		activeBlockType:
			typeof record.activeBlockType === "string"
				? record.activeBlockType
				: null,
		structuredTargetKind:
			kind === "block" || kind === "table" ? kind : null,
	};
}

export interface WorkingSetToolContext {
	activeBlockType?: string | null;
	markdown?: string | null;
	blockIds?: string[];
	surroundingBlocks?: Array<{ id: string }>;
	selectedText?: string | null;
}

export function readWorkingSetToolContext(
	value: unknown,
): WorkingSetToolContext {
	if (!value || typeof value !== "object") {
		return {};
	}
	const record = value as WorkingSetToolContext;
	return {
		activeBlockType: record.activeBlockType,
		markdown: record.markdown,
		blockIds: record.blockIds,
		surroundingBlocks: record.surroundingBlocks,
		selectedText: record.selectedText,
	};
}