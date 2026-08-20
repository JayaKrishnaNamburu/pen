import type { DocumentMutationPlan, DocumentMutationPlanKind } from "../planTypes";
import {
	DOCUMENT_MUTATION_PLAN_KIND_SET,
	FLOW_PATCH_EDIT_OPERATIONS,
	TEXT_EDIT_OPERATIONS,
	asRecord,
	isNonEmptyString,
	isPlanKindAllowedForTarget,
	isRecord,
	pushIssue,
	requireString,
	type PlanValidationContext,
	type PlanValidationIssue,
	type PlanValidationResult,
	validateConfidence,
	validatePosition,
	validateTextRange,
} from "./primitives";

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

	const kind = record.kind as DocumentMutationPlanKind;
	switch (kind) {
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
		case "review_bundle":
			validateReviewBundlePlan(record, path, issues);
			return;
		default: {
			const _exhaustive: never = kind;
			return _exhaustive;
		}
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
		default: {
			const _exhaustive: never = kind;
			return _exhaustive;
		}
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
