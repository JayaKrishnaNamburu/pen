// @ts-nocheck
import type { DocumentProfile } from "@pen/types";
import type { AITargetKind } from "../contracts";
import {
	DOCUMENT_MUTATION_PLAN_KINDS,
	type DocumentMutationPlan,
	type DocumentMutationPlanKind,
} from "../planTypes";
import { validateDatabaseEditPlan, validateReviewBundlePlan, validatePlanSemantics, validateTargetKindCompatibility, validateFlowPatchEditSemantics, validatePositionSemantics, validateKnownBlockType, validateMutableTargetBlockReference, validateScopedBlockReference } from "./planValidationPart2";
import { validateDatabaseEditStep, validateTextRange, validateConfidence, validatePosition, requireString, requireNumber, isPlanKindAllowedForTarget, pushIssue, asRecord, isRecord, isFiniteNumber, isNonEmptyString } from "./planValidationPart3";

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

export const DATABASE_EDIT_STEP_OPERATIONS = new Set([
	"add_column",
	"update_column",
	"insert_row",
	"update_cell",
	"add_view",
	"set_active_view",
]);

export const POSITION_LITERALS = new Set(["first", "last"]);

export function validateDocumentMutationPlanShape(
	plan: unknown,
	_context?: PlanValidationContext,
): PlanValidationResult {
	const issues: PlanValidationIssue[] = [];
	validatePlan(plan, "plan", issues);
	if (_context) {
		validatePlanSemantics(plan, "plan", issues, _context);
	}
	return {
		valid: !issues.some((issue) => issue.severity === "error"),
		issues,
	};
}

export function isDocumentMutationPlan(
	value: unknown,
): value is DocumentMutationPlan {
	return validateDocumentMutationPlanShape(value).valid;
}

export function validatePlan(
	plan: unknown,
	path: string,
	issues: PlanValidationIssue[],
): void {
	const record = asRecord(plan);
	if (!record) {
		pushIssue(issues, path, "invalid-shape", "Plan must be an object.");
		return;
	}

	if (!isNonEmptyString(record.kind)) {
		pushIssue(issues, `${path}.kind`, "missing-field", "Plan kind is required.");
		return;
	}

	if (!DOCUMENT_MUTATION_PLAN_KIND_SET.has(record.kind)) {
		pushIssue(
			issues,
			`${path}.kind`,
			"invalid-kind",
			`Unsupported plan kind "${record.kind}".`,
		);
		return;
	}

	switch (record.kind as DocumentMutationPlanKind) {
		case "text_edit":
			validateTextEditPlan(record, path, issues);
			return;
		case "flow_patch":
			validateFlowPatchPlan(record, path, issues);
			return;
		case "block_insert":
			validateBlockInsertPlan(record, path, issues);
			return;
		case "block_update":
			validateBlockUpdatePlan(record, path, issues);
			return;
		case "block_move":
			validateBlockMovePlan(record, path, issues);
			return;
		case "block_convert":
			validateBlockConvertPlan(record, path, issues);
			return;
		case "database_edit":
			validateDatabaseEditPlan(record, path, issues);
			return;
		case "review_bundle":
			validateReviewBundlePlan(record, path, issues);
			return;
	}
}

export function validateTextEditPlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	const target = asRecord(plan.target);
	if (!target) {
		pushIssue(
			issues,
			`${path}.target`,
			"invalid-shape",
			"Text edit target must be an object.",
		);
	} else {
		requireString(target, "blockId", `${path}.target`, issues);
		if (target.range !== undefined) {
			validateTextRange(target.range, `${path}.target.range`, issues);
		}
	}

	if (!isNonEmptyString(plan.operation) || !TEXT_EDIT_OPERATIONS.has(plan.operation)) {
		pushIssue(
			issues,
			`${path}.operation`,
			"invalid-shape",
			"Text edit operation must be replace, insert, or append.",
		);
	}

	requireString(plan, "text", path, issues);
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

export function validateFlowPatchPlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	requireString(plan, "instructions", path, issues);
	if (
		plan.scope !== undefined &&
		plan.scope !== "single-block" &&
		plan.scope !== "adjacent-blocks" &&
		plan.scope !== "section"
	) {
		pushIssue(
			issues,
			`${path}.scope`,
			"invalid-shape",
			'Flow patch scope must be "single-block", "adjacent-blocks", or "section".',
		);
	}
	if (plan.targetSpanId !== undefined && typeof plan.targetSpanId !== "string") {
		pushIssue(
			issues,
			`${path}.targetSpanId`,
			"invalid-shape",
			"targetSpanId must be a string when provided.",
		);
	}
	if (!Array.isArray(plan.edits)) {
		pushIssue(
			issues,
			`${path}.edits`,
			"invalid-shape",
			"Flow patch edits must be an array.",
		);
	} else {
		plan.edits.forEach((edit, index) => {
			validateFlowPatchEdit(edit, `${path}.edits[${index}]`, issues);
		});
	}
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

export function validateBlockInsertPlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	if (plan.blockId !== undefined && typeof plan.blockId !== "string") {
		pushIssue(
			issues,
			`${path}.blockId`,
			"invalid-shape",
			"blockId must be a string when provided.",
		);
	}
	requireString(plan, "blockType", path, issues);
	validatePosition(plan.position, `${path}.position`, issues);
	if (plan.props !== undefined && !isRecord(plan.props)) {
		pushIssue(issues, `${path}.props`, "invalid-shape", "Props must be an object.");
	}
	if (plan.initialText !== undefined && typeof plan.initialText !== "string") {
		pushIssue(
			issues,
			`${path}.initialText`,
			"invalid-shape",
			"Initial text must be a string.",
		);
	}
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

export function validateFlowPatchEdit(
	edit: unknown,
	path: string,
	issues: PlanValidationIssue[],
): void {
	const record = asRecord(edit);
	if (!record) {
		pushIssue(issues, path, "invalid-shape", "Flow patch edit must be an object.");
		return;
	}
	if (
		!isNonEmptyString(record.operation) ||
		!FLOW_PATCH_EDIT_OPERATIONS.has(record.operation)
	) {
		pushIssue(
			issues,
			`${path}.operation`,
			"invalid-shape",
			"Flow patch edit operation is unsupported.",
		);
	}
	const locator = asRecord(record.locator);
	if (!locator) {
		pushIssue(
			issues,
			`${path}.locator`,
			"invalid-shape",
			"Flow patch edit locator must be an object.",
		);
	} else {
		if (locator.blockId !== undefined && typeof locator.blockId !== "string") {
			pushIssue(
				issues,
				`${path}.locator.blockId`,
				"invalid-shape",
				"blockId must be a string when provided.",
			);
		}
		if (
			locator.blockIds !== undefined &&
			(!Array.isArray(locator.blockIds) ||
				!locator.blockIds.every((blockId) => typeof blockId === "string"))
		) {
			pushIssue(
				issues,
				`${path}.locator.blockIds`,
				"invalid-shape",
				"blockIds must be an array of strings when provided.",
			);
		}
		for (const field of [
			"retrievedSpanId",
			"expectedBlockType",
			"anchorBefore",
			"anchorAfter",
		] as const) {
			if (locator[field] !== undefined && typeof locator[field] !== "string") {
				pushIssue(
					issues,
					`${path}.locator.${field}`,
					"invalid-shape",
					`${field} must be a string when provided.`,
				);
			}
		}
	}

	if (record.text !== undefined && typeof record.text !== "string") {
		pushIssue(
			issues,
			`${path}.text`,
			"invalid-shape",
			"text must be a string when provided.",
		);
	}
	if (record.markdown !== undefined && typeof record.markdown !== "string") {
		pushIssue(
			issues,
			`${path}.markdown`,
			"invalid-shape",
			"markdown must be a string when provided.",
		);
	}
	validateConfidence(record.confidence, `${path}.confidence`, issues);
}

export function validateBlockUpdatePlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	requireString(plan, "blockId", path, issues);
	if (!isRecord(plan.props)) {
		pushIssue(issues, `${path}.props`, "invalid-shape", "Props must be an object.");
	}
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

export function validateBlockMovePlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	requireString(plan, "blockId", path, issues);
	validatePosition(plan.position, `${path}.position`, issues);
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

export function validateBlockConvertPlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	requireString(plan, "blockId", path, issues);
	requireString(plan, "newType", path, issues);
	if (plan.props !== undefined && !isRecord(plan.props)) {
		pushIssue(issues, `${path}.props`, "invalid-shape", "Props must be an object.");
	}
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}
