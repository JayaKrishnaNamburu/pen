import type { AIWorkingSetEnvelope } from "../types";
import type {
	AIExecutionMode,
	AIMutationMode,
	AITargetKind,
} from "./contracts";

/**
 * What kind of thing a generation is aimed at. This outlived the structured
 * planner it used to share a module with (`spec-v5/01-channel.md` UC3): the
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

	const structuredKind = readStructuredTargetKind(options.workingSet);
	if (structuredKind) {
		return structuredKind;
	}

	if (options.blockType === "table") {
		return "table";
	}
	return "block";
}

function readStructuredTargetKind(
	workingSet: AIWorkingSetEnvelope | null,
): AITargetKind | null {
	if (!workingSet?.context || typeof workingSet.context !== "object") {
		return null;
	}

	const context = workingSet.context as {
		structuredTarget?: {
			target?: {
				kind?: unknown;
			};
		} | null;
	};

	const kind = context.structuredTarget?.target?.kind;
	return kind === "block" || kind === "table" ? kind : null;
}

export function resolveExecutionMode(
	mutationMode: AIMutationMode,
): AIExecutionMode {
	if (mutationMode === "staged-review") {
		return "staged-review";
	}
	if (mutationMode === "persistent-suggestions") {
		return "persistent-suggestions";
	}
	return "direct-stream";
}
