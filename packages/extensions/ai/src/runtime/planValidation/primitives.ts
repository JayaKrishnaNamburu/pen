import type { DocumentProfile } from "@input/pen-types";
import type { AITargetKind } from "../contracts";
import {
	DOCUMENT_MUTATION_PLAN_KINDS,
	type DocumentMutationPlanKind,
} from "../planTypes";

export const PLAN_VALIDATION_SEVERITIES = ["info", "warn", "error"] as const;

export type PlanValidationSeverity =
	(typeof PLAN_VALIDATION_SEVERITIES)[number];

export interface PlanValidationIssue {
	path: string;
	code:
		| "missing-field"
		| "invalid-kind"
		| "invalid-shape"
		| "invalid-step"
		| "invalid-nested-plan"
		| "unsupported-target-kind"
		| "unknown-block-type"
		| "out-of-scope-target"
		| "read-only-target";
	severity: PlanValidationSeverity;
	message: string;
}

export interface PlanValidationContext {
	documentProfile?: DocumentProfile;
	targetKind?: AITargetKind;
	knownBlockTypes?: readonly string[];
	allowedTargetBlockIds?: readonly string[];
	editableTargetBlockIds?: readonly string[];
}

export interface PlanValidationResult {
	valid: boolean;
	issues: PlanValidationIssue[];
}

export const DOCUMENT_MUTATION_PLAN_KIND_SET = new Set<string>(
	DOCUMENT_MUTATION_PLAN_KINDS,
);

export const TEXT_EDIT_OPERATIONS = new Set(["replace", "insert", "append"]);

export const FLOW_PATCH_EDIT_OPERATIONS = new Set([
	"replace_text",
	"append_text",
	"insert_before",
	"insert_after",
	"replace_blocks",
	"delete_blocks",
]);

export const POSITION_LITERALS = new Set(["first", "last"]);

export function validateTextRange(
	value: unknown,
	path: string,
	issues: PlanValidationIssue[],
): void {
	const range = asRecord(value);
	if (!range) {
		pushIssue(issues, path, "invalid-shape", "Range must be an object.");
		return;
	}

	requireNumber(range, "startOffset", path, issues);
	requireNumber(range, "endOffset", path, issues);
}

export function validateConfidence(
	value: unknown,
	path: string,
	issues: PlanValidationIssue[],
): void {
	if (value === undefined) {
		return;
	}

	const confidence = asRecord(value);
	if (!confidence) {
		pushIssue(
			issues,
			path,
			"invalid-shape",
			"Confidence must be an object when provided.",
		);
		return;
	}

	if (confidence.score !== undefined && !isFiniteNumber(confidence.score)) {
		pushIssue(
			issues,
			`${path}.score`,
			"invalid-shape",
			"Confidence score must be a number.",
		);
	}
	if (confidence.reason !== undefined && typeof confidence.reason !== "string") {
		pushIssue(
			issues,
			`${path}.reason`,
			"invalid-shape",
			"Confidence reason must be a string.",
		);
	}
}

export function validatePosition(
	value: unknown,
	path: string,
	issues: PlanValidationIssue[],
): void {
	if (typeof value === "string") {
		if (POSITION_LITERALS.has(value)) {
			return;
		}
		pushIssue(issues, path, "invalid-shape", "Position string is invalid.");
		return;
	}

	const position = asRecord(value);
	if (!position) {
		pushIssue(issues, path, "invalid-shape", "Position must be an object.");
		return;
	}

	if (isNonEmptyString(position.before)) {
		return;
	}
	if (isNonEmptyString(position.after)) {
		return;
	}
	if (isNonEmptyString(position.parent) && isFiniteNumber(position.index)) {
		return;
	}

	pushIssue(issues, path, "invalid-shape", "Position object is invalid.");
}

export function requireString(
	record: Record<string, unknown>,
	field: string,
	path: string,
	issues: PlanValidationIssue[],
): void {
	const value = record[field];
	if (typeof value === "string" && value.length > 0) {
		return;
	}

	pushIssue(
		issues,
		`${path}.${field}`,
		value === undefined ? "missing-field" : "invalid-shape",
		`${field} must be a non-empty string.`,
	);
}

export function requireNumber(
	record: Record<string, unknown>,
	field: string,
	path: string,
	issues: PlanValidationIssue[],
): void {
	const value = record[field];
	if (isFiniteNumber(value)) {
		return;
	}

	pushIssue(
		issues,
		`${path}.${field}`,
		value === undefined ? "missing-field" : "invalid-shape",
		`${field} must be a number.`,
	);
}

export function isPlanKindAllowedForTarget(
	kind: DocumentMutationPlanKind,
	targetKind: AITargetKind,
): boolean {
	switch (targetKind) {
		case "text":
			return kind === "text_edit" || kind === "flow_patch" || kind === "review_bundle";
		case "block":
			return true;
		case "table":
			return (
				kind === "flow_patch" ||
				kind === "block_update" ||
				kind === "block_move" ||
				kind === "block_convert" ||
				kind === "review_bundle"
			);
		default: {
			const _exhaustive: never = targetKind;
			return _exhaustive;
		}
	}
}

export function pushIssue(
	issues: PlanValidationIssue[],
	path: string,
	code: PlanValidationIssue["code"],
	message: string,
): void {
	issues.push({
		path,
		code,
		severity: "error",
		message,
	});
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}
