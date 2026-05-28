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
import { validateDatabaseEditStep, validateTextRange, validateConfidence, validatePosition, requireString, requireNumber, isPlanKindAllowedForTarget, pushIssue, asRecord, isRecord, isFiniteNumber, isNonEmptyString } from "./planValidationPart3";

export function validateDatabaseEditPlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	requireString(plan, "blockId", path, issues);
	if (!Array.isArray(plan.steps)) {
		pushIssue(
			issues,
			`${path}.steps`,
			"invalid-shape",
			"Database edit steps must be an array.",
		);
	} else {
		plan.steps.forEach((step, index) => {
			validateDatabaseEditStep(step, `${path}.steps[${index}]`, issues);
		});
	}
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

export function validateReviewBundlePlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	requireString(plan, "label", path, issues);
	requireString(plan, "reason", path, issues);

	if (!Array.isArray(plan.plans)) {
		pushIssue(
			issues,
			`${path}.plans`,
			"invalid-shape",
			"Review bundle plans must be an array.",
		);
	} else {
		plan.plans.forEach((childPlan, index) => {
			const childIssuesBefore = issues.length;
			validatePlan(childPlan, `${path}.plans[${index}]`, issues);
			if (issues.length > childIssuesBefore) {
				pushIssue(
					issues,
					`${path}.plans[${index}]`,
					"invalid-nested-plan",
					"Review bundle contains an invalid nested plan.",
				);
			}
		});
	}

	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

export function validatePlanSemantics(
	plan: unknown,
	path: string,
	issues: PlanValidationIssue[],
	context: PlanValidationContext,
): void {
	const record = asRecord(plan);
	if (!record || !isNonEmptyString(record.kind)) {
		return;
	}

	if (!DOCUMENT_MUTATION_PLAN_KIND_SET.has(record.kind)) {
		return;
	}

	const kind = record.kind as DocumentMutationPlanKind;
	validateTargetKindCompatibility(kind, path, issues, context);

	switch (kind) {
		case "text_edit": {
			const target = asRecord(record.target);
			if (!target) {
				return;
			}
			validateMutableTargetBlockReference(
				target.blockId,
				`${path}.target.blockId`,
				issues,
				context,
			);
			return;
		}
		case "flow_patch": {
			if (!Array.isArray(record.edits)) {
				return;
			}
			record.edits.forEach((edit, index) => {
				validateFlowPatchEditSemantics(
					edit,
					`${path}.edits[${index}]`,
					issues,
					context,
				);
			});
			return;
		}
		case "block_insert":
			validateKnownBlockType(record.blockType, `${path}.blockType`, issues, context);
			validatePositionSemantics(record.position, `${path}.position`, issues, context);
			return;
		case "block_update":
			validateMutableTargetBlockReference(
				record.blockId,
				`${path}.blockId`,
				issues,
				context,
			);
			return;
		case "block_move":
			validateMutableTargetBlockReference(
				record.blockId,
				`${path}.blockId`,
				issues,
				context,
			);
			validatePositionSemantics(record.position, `${path}.position`, issues, context);
			return;
		case "block_convert":
			validateMutableTargetBlockReference(
				record.blockId,
				`${path}.blockId`,
				issues,
				context,
			);
			validateKnownBlockType(record.newType, `${path}.newType`, issues, context);
			return;
		case "database_edit":
			validateMutableTargetBlockReference(
				record.blockId,
				`${path}.blockId`,
				issues,
				context,
			);
			return;
		case "review_bundle":
			if (!Array.isArray(record.plans)) {
				return;
			}
			record.plans.forEach((childPlan, index) => {
				validatePlanSemantics(
					childPlan,
					`${path}.plans[${index}]`,
					issues,
					context,
				);
			});
			return;
	}
}

export function validateTargetKindCompatibility(
	kind: DocumentMutationPlanKind,
	path: string,
	issues: PlanValidationIssue[],
	context: PlanValidationContext,
): void {
	if (!context.targetKind) {
		return;
	}

	if (isPlanKindAllowedForTarget(kind, context.targetKind)) {
		return;
	}

	pushIssue(
		issues,
		`${path}.kind`,
		"unsupported-target-kind",
		`Plan kind "${kind}" is not supported for ${context.targetKind} targets.`,
	);
}

export function validateFlowPatchEditSemantics(
	edit: unknown,
	path: string,
	issues: PlanValidationIssue[],
	context: PlanValidationContext,
): void {
	const record = asRecord(edit);
	if (!record) {
		return;
	}

	const locator = asRecord(record.locator);
	if (!locator) {
		return;
	}

	validateMutableTargetBlockReference(
		locator.blockId,
		`${path}.locator.blockId`,
		issues,
		context,
	);

	if (Array.isArray(locator.blockIds)) {
		locator.blockIds.forEach((blockId, index) => {
			validateMutableTargetBlockReference(
				blockId,
				`${path}.locator.blockIds[${index}]`,
				issues,
				context,
			);
		});
	}

	validateScopedBlockReference(
		locator.anchorBefore,
		`${path}.locator.anchorBefore`,
		issues,
		context,
	);
	validateScopedBlockReference(
		locator.anchorAfter,
		`${path}.locator.anchorAfter`,
		issues,
		context,
	);
	validateKnownBlockType(
		locator.expectedBlockType,
		`${path}.locator.expectedBlockType`,
		issues,
		context,
	);
}

export function validatePositionSemantics(
	value: unknown,
	path: string,
	issues: PlanValidationIssue[],
	context: PlanValidationContext,
): void {
	const position = asRecord(value);
	if (!position) {
		return;
	}

	validateScopedBlockReference(position.before, `${path}.before`, issues, context);
	validateScopedBlockReference(position.after, `${path}.after`, issues, context);
	validateScopedBlockReference(position.parent, `${path}.parent`, issues, context);
}

export function validateKnownBlockType(
	value: unknown,
	path: string,
	issues: PlanValidationIssue[],
	context: PlanValidationContext,
): void {
	if (
		!isNonEmptyString(value) ||
		!context.knownBlockTypes ||
		context.knownBlockTypes.includes(value)
	) {
		return;
	}

	pushIssue(
		issues,
		path,
		"unknown-block-type",
		`Block type "${value}" is not available in ${context.documentProfile ?? "this"} documents.`,
	);
}

export function validateMutableTargetBlockReference(
	value: unknown,
	path: string,
	issues: PlanValidationIssue[],
	context: PlanValidationContext,
): void {
	if (!isNonEmptyString(value)) {
		return;
	}

	if (
		context.allowedTargetBlockIds &&
		!context.allowedTargetBlockIds.includes(value)
	) {
		pushIssue(
			issues,
			path,
			"out-of-scope-target",
			`Block "${value}" is outside the validated mutation scope.`,
		);
		return;
	}

	if (
		context.editableTargetBlockIds &&
		!context.editableTargetBlockIds.includes(value)
	) {
		pushIssue(
			issues,
			path,
			"read-only-target",
			`Block "${value}" is not editable in ${context.documentProfile ?? "this"} documents.`,
		);
	}
}

export function validateScopedBlockReference(
	value: unknown,
	path: string,
	issues: PlanValidationIssue[],
	context: PlanValidationContext,
): void {
	if (
		!isNonEmptyString(value) ||
		!context.allowedTargetBlockIds ||
		context.allowedTargetBlockIds.includes(value)
	) {
		return;
	}

	pushIssue(
		issues,
		path,
		"out-of-scope-target",
		`Block "${value}" is outside the validated mutation scope.`,
	);
}
