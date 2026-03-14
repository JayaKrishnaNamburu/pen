import type { DocumentProfile } from "@pen/types";
import type { AITargetKind } from "./contracts";
import {
	DOCUMENT_MUTATION_PLAN_KINDS,
	type DocumentMutationPlan,
	type DocumentMutationPlanKind,
} from "./planTypes";

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

const DOCUMENT_MUTATION_PLAN_KIND_SET = new Set<string>(
	DOCUMENT_MUTATION_PLAN_KINDS,
);

const TEXT_EDIT_OPERATIONS = new Set(["replace", "insert", "append"]);
const FLOW_PATCH_EDIT_OPERATIONS = new Set([
	"replace_text",
	"append_text",
	"insert_before",
	"insert_after",
	"replace_blocks",
	"delete_blocks",
]);
const DATABASE_EDIT_STEP_OPERATIONS = new Set([
	"add_column",
	"update_column",
	"insert_row",
	"update_cell",
	"add_view",
	"set_active_view",
]);
const POSITION_LITERALS = new Set(["first", "last"]);

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

function validatePlan(
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

function validateTextEditPlan(
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

function validateFlowPatchPlan(
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

function validateBlockInsertPlan(
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

function validateFlowPatchEdit(
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

function validateBlockUpdatePlan(
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

function validateBlockMovePlan(
	plan: Record<string, unknown>,
	path: string,
	issues: PlanValidationIssue[],
): void {
	requireString(plan, "blockId", path, issues);
	validatePosition(plan.position, `${path}.position`, issues);
	validateConfidence(plan.confidence, `${path}.confidence`, issues);
}

function validateBlockConvertPlan(
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

function validateDatabaseEditPlan(
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

function validateReviewBundlePlan(
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

function validatePlanSemantics(
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

function validateTargetKindCompatibility(
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

function validateFlowPatchEditSemantics(
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

function validatePositionSemantics(
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

function validateKnownBlockType(
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

function validateMutableTargetBlockReference(
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

function validateScopedBlockReference(
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

function validateDatabaseEditStep(
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

function validateTextRange(
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

function validateConfidence(
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

function validatePosition(
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

function requireString(
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

function requireNumber(
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

function isPlanKindAllowedForTarget(
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

function pushIssue(
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

function asRecord(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}
