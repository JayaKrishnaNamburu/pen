import type { AIWorkingSetEnvelope } from "../types";
import type {
	AIExecutionMode,
	AIPlannerMode,
	AITargetKind,
	AIMutationMode,
} from "./contracts";
import type { DocumentMutationPlan } from "./planTypes";
import {
	validateDocumentMutationPlanShape,
	type PlanValidationIssue,
} from "./planValidation";

export interface StructuredPlannerConfig {
	prompt: string;
	targetKind: AITargetKind;
	workingSet: AIWorkingSetEnvelope | null;
}

export interface StructuredPlannerParseResult {
	plan: DocumentMutationPlan | null;
	planState: "drafted" | "validated" | "rejected";
	issues: PlanValidationIssue[];
}

export function resolvePlannerMode(options: {
	targetKind: AITargetKind;
	intent: "rewrite" | "continue" | "local-edit" | "structural" | "search" | "review" | "unknown";
	target: "selection" | "block";
}): AIPlannerMode {
	if (options.target === "selection") {
		return "text";
	}
	if (options.targetKind === "database") {
		return "structured";
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
	if (options.blockType === "database") {
		return "database";
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
		"- for new databases, prefer a review_bundle that inserts the block first and then applies database_edit steps to that inserted block",
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

function resolveAllowedPlanKinds(targetKind: AITargetKind): string[] {
	if (targetKind === "database") {
		return ["database_edit", "review_bundle"];
	}
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

function buildTargetSummary(workingSet: AIWorkingSetEnvelope | null): string {
	if (!workingSet) {
		return "No working set available.";
	}

	try {
		return JSON.stringify(workingSet.context ?? null);
	} catch {
		return "Working set context could not be serialized.";
	}
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
	return kind === "block" || kind === "table" || kind === "database"
		? kind
		: null;
}

function normalizeStructuredPlanCandidate(
	value: unknown,
	targetKind: AITargetKind,
): unknown {
	const record = asRecord(value);
	if (!record || typeof record.kind !== "string") {
		return value;
	}

	switch (record.kind) {
		case "review_bundle":
			return normalizeReviewBundlePlan(record, targetKind);
		case "block_insert":
			return normalizeBlockInsertPlan(record, targetKind);
		case "database_edit":
			return normalizeDatabaseEditPlan(record);
		default:
			return value;
	}
}

function normalizeReviewBundlePlan(
	record: Record<string, unknown>,
	targetKind: AITargetKind,
): Record<string, unknown> {
	const plans = Array.isArray(record.plans)
		? record.plans.map((plan) => normalizeStructuredPlanCandidate(plan, targetKind))
		: record.plans;
	return {
		...record,
		label: readNonEmptyString(record.label) ?? "Structured changes",
		reason:
			readNonEmptyString(record.reason) ??
			"Apply the requested structured changes.",
		confidence: normalizeConfidence(record.confidence),
		plans,
	};
}

function normalizeBlockInsertPlan(
	record: Record<string, unknown>,
	targetKind: AITargetKind,
): Record<string, unknown> {
	const block = asRecord(record.block);
	const blockType =
		readNonEmptyString(record.blockType) ??
		readNonEmptyString(block?.type) ??
		readNonEmptyString(block?.kind) ??
		(targetKind === "database" ? targetKind : null);

	return {
		...record,
		...(blockType ? { blockType } : {}),
		confidence: normalizeConfidence(record.confidence),
		position: normalizePosition(record.position),
	};
}

function normalizeDatabaseEditPlan(
	record: Record<string, unknown>,
): Record<string, unknown> {
	const target = asRecord(record.target);
	const blockId =
		readNonEmptyString(record.blockId) ?? readNonEmptyString(target?.blockId);
	return {
		...record,
		...(blockId ? { blockId } : {}),
		confidence: normalizeConfidence(record.confidence),
	};
}

function normalizePosition(value: unknown): unknown {
	const position = asRecord(value);
	if (!position) {
		return value;
	}
	const parentId = readNonEmptyString(position.parentId);
	if (parentId && isFiniteNumber(position.index)) {
		if (parentId === "root") {
			return position.index <= 0 ? "first" : "last";
		}
		return {
			parent: parentId,
			index: position.index,
		};
	}
	if (
		parentId === "root" &&
		("after" in position || "before" in position) &&
		!isFiniteNumber(position.index)
	) {
		return "last";
	}
	const relativeTo = readNonEmptyString(position.relativeTo);
	const placement = readNonEmptyString(position.placement);
	if (relativeTo === "active") {
		if (placement === "before") {
			return "first";
		}
		if (placement === "after") {
			return "last";
		}
	}
	return value;
}

function normalizeConfidence(value: unknown): unknown {
	if (isFiniteNumber(value)) {
		return { score: value };
	}
	return value;
}

function extractJsonObject(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
	return extractBalancedJsonObject(candidate);
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function parsePartialStructuredPlan(
	value: string,
	targetKind: AITargetKind,
): DocumentMutationPlan | null {
	const kind = readStringField(value, "kind");
	if (!kind) {
		return null;
	}

	if (kind === "review_bundle") {
		const nestedPlans = readPartialObjectArray(value, "plans").filter((plan) =>
			validateDocumentMutationPlanShape(plan, { targetKind }).valid,
		) as DocumentMutationPlan[];
		if (nestedPlans.length === 0) {
			return null;
		}
		return {
			kind,
			label: readStringField(value, "label") ?? "Streaming review bundle",
			reason:
				readStringField(value, "reason") ??
				"Previewing mixed structural changes while the plan streams.",
			plans: nestedPlans,
		};
	}

	if (kind === "text_edit" && targetKind === "text") {
		const blockId = readStringField(value, "blockId");
		const operation = readStringField(value, "operation");
		const text = readStringField(value, "text");
		if (!blockId || !operation || text == null) {
			return null;
		}
		return {
			kind,
			target: { blockId },
			operation: operation as "replace" | "insert" | "append",
			text,
		};
	}

	if (targetKind === "block") {
		if (kind === "block_insert") {
			const blockId = readStringField(value, "blockId");
			const blockType = readStringField(value, "blockType");
			const position = readPositionField(value, "position");
			if (!blockType || !position) {
				return null;
			}
			return {
				kind,
				blockId: blockId ?? undefined,
				blockType,
				position,
				props:
					(readObjectField(value, "props") as Record<string, unknown> | null) ??
					undefined,
				initialText: readStringField(value, "initialText") ?? undefined,
			};
		}

		if (kind === "block_update") {
			const blockId = readStringField(value, "blockId");
			const props = readObjectField(value, "props");
			if (!blockId || !isRecordValue(props)) {
				return null;
			}
			return {
				kind,
				blockId,
				props,
			};
		}

		if (kind === "block_move") {
			const blockId = readStringField(value, "blockId");
			const position = readPositionField(value, "position");
			if (!blockId || !position) {
				return null;
			}
			return {
				kind,
				blockId,
				position,
			};
		}

		if (kind === "block_convert") {
			const blockId = readStringField(value, "blockId");
			const newType = readStringField(value, "newType");
			if (!blockId || !newType) {
				return null;
			}
			return {
				kind,
				blockId,
				newType,
				props:
					(readObjectField(value, "props") as Record<string, unknown> | null) ??
					undefined,
			};
		}
	}

	if (kind === "database_edit" && targetKind === "database") {
		const blockId = readStringField(value, "blockId");
		if (!blockId) {
			return null;
		}
		const steps = readPartialObjectArray(value, "steps");
		if (steps.length === 0) {
			return null;
		}
		return {
			kind,
			blockId,
			steps,
		} as DocumentMutationPlan;
	}

	return null;
}

function readStringField(value: string, fieldName: string): string | null {
	const fieldMatch = value.match(
		new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, "m"),
	);
	if (!fieldMatch?.[1]) {
		return null;
	}
	try {
		return JSON.parse(`"${fieldMatch[1]}"`) as string;
	} catch {
		return fieldMatch[1];
	}
}

function readPartialObjectArray(value: string, fieldName: string): unknown[] {
	const fieldMatch = value.match(
		new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\[`, "m"),
	);
	if (!fieldMatch || fieldMatch.index == null) {
		return [];
	}

	const arrayStart = fieldMatch.index + fieldMatch[0].length - 1;
	return readBalancedObjectsFromArray(value.slice(arrayStart));
}

function readObjectField(value: string, fieldName: string): unknown | null {
	const fieldMatch = value.match(
		new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`, "m"),
	);
	if (!fieldMatch || fieldMatch.index == null) {
		return null;
	}

	const objectStart = fieldMatch.index + fieldMatch[0].length - 1;
	const objectText = extractBalancedJsonObject(value.slice(objectStart));
	if (!objectText) {
		return null;
	}
	try {
		return JSON.parse(objectText) as unknown;
	} catch {
		return null;
	}
}

function readPositionField(
	value: string,
	fieldName: string,
): "first" | "last" | { before: string } | { after: string } | { parent: string; index: number } | null {
	const stringValue = readStringField(value, fieldName);
	if (stringValue === "first" || stringValue === "last") {
		return stringValue;
	}

	const objectValue = readObjectField(value, fieldName);
	if (!isRecordValue(objectValue)) {
		return null;
	}
	if (typeof objectValue.before === "string" && objectValue.before.length > 0) {
		return { before: objectValue.before };
	}
	if (typeof objectValue.after === "string" && objectValue.after.length > 0) {
		return { after: objectValue.after };
	}
	if (
		typeof objectValue.parent === "string" &&
		objectValue.parent.length > 0 &&
		typeof objectValue.index === "number"
	) {
		return { parent: objectValue.parent, index: objectValue.index };
	}
	return null;
}

function readBalancedObjectsFromArray(value: string): unknown[] {
	const parsedValues: unknown[] = [];
	let depth = 0;
	let inString = false;
	let isEscaped = false;
	let objectStart = -1;

	for (let index = 0; index < value.length; index += 1) {
		const character = value[index]!;
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (character === "\\") {
			isEscaped = true;
			continue;
		}
		if (character === "\"") {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (character === "{") {
			if (depth === 0) {
				objectStart = index;
			}
			depth += 1;
			continue;
		}
		if (character === "}") {
			depth -= 1;
			if (depth === 0 && objectStart >= 0) {
				const objectText = value.slice(objectStart, index + 1);
				try {
					parsedValues.push(JSON.parse(objectText) as unknown);
				} catch {
					return parsedValues;
				}
				objectStart = -1;
			}
		}
	}

	return parsedValues;
}

function extractBalancedJsonObject(value: string): string | null {
	const startIndex = value.indexOf("{");
	if (startIndex === -1) {
		return null;
	}

	let depth = 0;
	let inString = false;
	let isEscaped = false;
	for (let index = startIndex; index < value.length; index += 1) {
		const character = value[index]!;
		if (isEscaped) {
			isEscaped = false;
			continue;
		}
		if (character === "\\") {
			isEscaped = true;
			continue;
		}
		if (character === "\"") {
			inString = !inString;
			continue;
		}
		if (inString) {
			continue;
		}
		if (character === "{") {
			depth += 1;
			continue;
		}
		if (character === "}") {
			depth -= 1;
			if (depth === 0) {
				return value.slice(startIndex, index + 1);
			}
		}
	}

	return null;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
