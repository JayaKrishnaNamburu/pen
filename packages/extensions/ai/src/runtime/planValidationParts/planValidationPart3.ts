// @ts-nocheck
import type { DocumentProfile } from "@pen/types";
import type { AITargetKind } from "../contracts";
import {
	DOCUMENT_MUTATION_PLAN_KINDS,
	type DocumentMutationPlan,
	type DocumentMutationPlanKind,
} from "../planTypes";
import { PLAN_VALIDATION_SEVERITIES, DOCUMENT_MUTATION_PLAN_KIND_SET, TEXT_EDIT_OPERATIONS, FLOW_PATCH_EDIT_OPERATIONS, DATABASE_EDIT_STEP_OPERATIONS, POSITION_LITERALS, validateDocumentMutationPlanShape, isDocumentMutationPlan, validatePlan, validateTextEditPlan, validateFlowPatchPlan, validateBlockInsertPlan, validateFlowPatchEdit, validateBlockUpdatePlan, validateBlockMovePlan, validateBlockConvertPlan } from "./planValidationPart1";
import type { PlanValidationSeverity, PlanValidationIssue, PlanValidationContext, PlanValidationResult } from "./planValidationPart1";
import { validateDatabaseEditPlan, validateReviewBundlePlan, validatePlanSemantics, validateTargetKindCompatibility, validateFlowPatchEditSemantics, validatePositionSemantics, validateKnownBlockType, validateMutableTargetBlockReference, validateScopedBlockReference } from "./planValidationPart2";

export function validateDatabaseEditStep(
	step: unknown,
	path: string,
	issues: PlanValidationIssue[],
): void {
	const record = asRecord(step);
	if (!record) {
		pushIssue(
			issues,
			path,
			"invalid-step",
			"Database edit step must be an object.",
		);
		return;
	}

	if (
		!isNonEmptyString(record.op) ||
		!DATABASE_EDIT_STEP_OPERATIONS.has(record.op)
	) {
		pushIssue(
			issues,
			`${path}.op`,
			"invalid-step",
			"Unsupported database edit step operation.",
		);
		return;
	}

	switch (record.op) {
		case "add_column":
			if (!isRecord(record.column)) {
				pushIssue(
					issues,
					`${path}.column`,
					"invalid-step",
					"Column must be an object.",
				);
			}
			return;
		case "update_column":
			requireString(record, "columnId", path, issues);
			if (!isRecord(record.patch)) {
				pushIssue(
					issues,
					`${path}.patch`,
					"invalid-step",
					"Column patch must be an object.",
				);
			}
			return;
		case "insert_row":
			if (record.rowId !== undefined && typeof record.rowId !== "string") {
				pushIssue(
					issues,
					`${path}.rowId`,
					"invalid-step",
					"Row id must be a string.",
				);
			}
			if (!isRecord(record.values)) {
				pushIssue(
					issues,
					`${path}.values`,
					"invalid-step",
					"Row values must be an object.",
				);
			}
			return;
		case "update_cell":
			requireString(record, "rowId", path, issues);
			requireString(record, "columnId", path, issues);
			return;
		case "add_view":
			if (!isRecord(record.view)) {
				pushIssue(
					issues,
					`${path}.view`,
					"invalid-step",
					"View must be an object.",
				);
			}
			return;
		case "set_active_view":
			requireString(record, "viewId", path, issues);
			return;
	}
}

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
		case "database":
			return (
				kind === "block_insert" ||
				kind === "block_update" ||
				kind === "block_move" ||
				kind === "block_convert" ||
				kind === "database_edit" ||
				kind === "review_bundle"
			);
		case "text":
			return kind === "text_edit" || kind === "flow_patch" || kind === "review_bundle";
		case "block":
			return kind !== "database_edit";
		case "table":
			return (
				kind === "flow_patch" ||
				kind === "block_update" ||
				kind === "block_move" ||
				kind === "block_convert" ||
				kind === "review_bundle"
			);
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
