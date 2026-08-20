import type { AIWorkingSetEnvelope } from "../../types";
import type {
	AIExecutionMode,
	AIPlannerMode,
	AITargetKind,
	AIMutationMode,
} from "../contracts";
import type { DocumentMutationPlan } from "../planTypes";
import { validateDocumentMutationPlanShape } from "../planValidation";
import {
	normalizeStructuredPlanCandidate,
	parsePartialStructuredPlan,
} from "./normalize";
import { extractJsonObject } from "./primitives";
import type {
	StructuredPlannerConfig,
	StructuredPlannerParseResult,
} from "./types";

export function resolvePlannerMode(options: {
	targetKind: AITargetKind;
	intent: "rewrite" | "continue" | "local-edit" | "structural" | "search" | "review" | "unknown";
	target: "selection" | "block";
}): AIPlannerMode {
	if (options.target === "selection") {
		return "text";
	}
	if (options.targetKind === "table") {
		return "text";
	}
	if (options.intent === "structural" || options.intent === "review") {
		return "structured";
	}
	return "text";
}

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

export function buildPlannerPrompt(
	config: StructuredPlannerConfig,
): string {
	const allowedPlanKinds = resolveAllowedPlanKinds(config.targetKind);
	const targetSummary = buildTargetSummary(config.workingSet);

	return [
		"Produce a structured Pen document mutation plan.",
		"Return exactly one JSON object and no markdown fences or prose.",
		`Target kind: ${config.targetKind}`,
		`Allowed top-level plan kinds: ${allowedPlanKinds.join(", ")}`,
		"",
		"Use these JSON-shape rules:",
		'- include a top-level "kind" string',
		"- include all required object properties for the chosen plan kind",
		"- use arrays only for ordered step lists",
		"- use nested objects for target, position, confidence, and patch payloads",
		"- for review bundles, return a review_bundle with nested plans",
		"- if later plans need to target a newly inserted block, include blockId on the block_insert plan and reuse that same blockId in later plans",
		"",
		"Context summary:",
		targetSummary,
		"",
		"User request:",
		config.prompt,
	].join("\n");
}

export function parseStructuredPlanResult(
	value: string,
	targetKind: AITargetKind,
): StructuredPlannerParseResult {
	if (targetKind === "table") {
		return {
			plan: null,
			planState: "rejected",
			issues: [
				{
					path: "plan",
					code: "invalid-kind",
					severity: "error",
					message:
						"Structured table plans are not supported. Use the markdown authoring lane for tables.",
				},
			],
		};
	}
	const jsonPayload = extractJsonObject(value);
	if (!jsonPayload) {
		return {
			plan: null,
			planState: "rejected",
			issues: [
				{
					path: "plan",
					code: "invalid-shape",
					severity: "error",
					message: "Planner response did not contain a JSON object.",
				},
			],
		};
	}

	try {
		const parsed = normalizeStructuredPlanCandidate(
			JSON.parse(jsonPayload) as unknown,
			targetKind,
		);
		const validation = validateDocumentMutationPlanShape(parsed, { targetKind });
		return {
			plan: validation.valid ? (parsed as DocumentMutationPlan) : null,
			planState: validation.valid ? "validated" : "rejected",
			issues: validation.issues,
		};
	} catch (error) {
		return {
			plan: null,
			planState: "rejected",
			issues: [
				{
					path: "plan",
					code: "invalid-shape",
					severity: "error",
					message:
						error instanceof Error
							? error.message
							: "Planner response could not be parsed as JSON.",
				},
			],
		};
	}
}

export function parseStructuredPlanPreview(
	value: string,
	targetKind: AITargetKind,
): StructuredPlannerParseResult | null {
	if (targetKind === "table") {
		return null;
	}
	const jsonPayload = extractJsonObject(value);
	if (jsonPayload) {
		try {
			const parsed = normalizeStructuredPlanCandidate(
				JSON.parse(jsonPayload) as unknown,
				targetKind,
			);
			const validation = validateDocumentMutationPlanShape(parsed, { targetKind });
			if (!validation.valid) {
				return null;
			}
			return {
				plan: parsed as DocumentMutationPlan,
				planState: "validated",
				issues: validation.issues,
			};
		} catch {
			// Fall through to tolerant parsing.
		}
	}

	const partialPlan = parsePartialStructuredPlan(value, targetKind);
	if (!partialPlan) {
		return null;
	}
	const validation = validateDocumentMutationPlanShape(partialPlan, { targetKind });
	if (!validation.valid) {
		return null;
	}
	return {
		plan: partialPlan,
		planState: "drafted",
		issues: validation.issues,
	};
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

export function resolveAllowedPlanKinds(targetKind: AITargetKind): string[] {
	if (targetKind === "text") {
		return ["text_edit", "review_bundle"];
	}
	return [
		"text_edit",
		"block_insert",
		"block_update",
		"block_move",
		"block_convert",
		"review_bundle",
	];
}

export function buildTargetSummary(workingSet: AIWorkingSetEnvelope | null): string {
	if (!workingSet) {
		return "No working set available.";
	}

	try {
		return JSON.stringify(workingSet.context ?? null);
	} catch {
		// unstringifiable working-set context.
		return "Working set context could not be serialized.";
	}
}

export function readStructuredTargetKind(
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
