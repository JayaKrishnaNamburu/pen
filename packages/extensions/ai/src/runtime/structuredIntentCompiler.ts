import { generateId } from "@input/pen-types";
import type { Position } from "@input/pen-types";
import type {
	BlockConvertPlan,
	BlockInsertPlan,
	BlockMovePlan,
	BlockUpdatePlan,
	DocumentMutationPlan,
	ReviewBundlePlan,
	TextEditPlan,
} from "./planTypes";
import type {
	ConvertBlockIntent,
	InsertBlockIntent,
	MoveBlockIntent,
	ReviewBundleIntent,
	StructuredInsertPosition,
	StructuredIntent,
	TextEditIntent,
	UpdateBlockIntent,
} from "./structuredIntent";

export interface StructuredIntentCompilationIssue {
	path: string;
	code: "invalid-shape" | "missing-field";
	message: string;
}

export interface StructuredIntentCompilationResult {
	plan: DocumentMutationPlan | null;
	issues: StructuredIntentCompilationIssue[];
}

export function compileStructuredIntentToPlan(
	intent: StructuredIntent,
	options: { activeBlockId: string | null },
): StructuredIntentCompilationResult {
	const issues: StructuredIntentCompilationIssue[] = [];
	const plan = lowerStructuredIntent(intent, options, "intent", issues);
	return {
		plan,
		issues,
	};
}

function lowerStructuredIntent(
	intent: StructuredIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): DocumentMutationPlan | null {
	switch (intent.kind) {
		case "insert_block":
			return lowerInsertBlockIntent(intent, options, path, issues);
		case "update_block":
			return lowerUpdateBlockIntent(intent);
		case "move_block":
			return lowerMoveBlockIntent(intent, options, path, issues);
		case "convert_block":
			return lowerConvertBlockIntent(intent);
		case "text_edit":
			return lowerTextEditIntent(intent);
		case "review_bundle":
			return lowerReviewBundleIntent(intent, options, path, issues);
		default: {
			const _exhaustive: never = intent;
			return _exhaustive;
		}
	}
}

function lowerInsertBlockIntent(
	intent: InsertBlockIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): DocumentMutationPlan | null {
	if (intent.blockType === "table") {
		issues.push({
			path,
			code: "invalid-shape",
			message:
				"Structured table block inserts are not supported. Use the markdown authoring lane for tables.",
		});
		return null;
	}
	const blockId = intent.blockId ?? generateId();
	const position = lowerInsertPosition(intent.position, options.activeBlockId, path, issues);
	if (!position) {
		return null;
	}
	const insertPlan: BlockInsertPlan = {
		kind: "block_insert",
		blockId,
		blockType: intent.blockType,
		position,
		props: intent.props,
		initialText: intent.initialText,
		confidence: intent.confidence,
	};
	return insertPlan;
}

function lowerUpdateBlockIntent(intent: UpdateBlockIntent): BlockUpdatePlan {
	return {
		kind: "block_update",
		blockId: intent.blockId,
		props: intent.props,
		confidence: intent.confidence,
	};
}

function lowerMoveBlockIntent(
	intent: MoveBlockIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): BlockMovePlan | null {
	const position = lowerInsertPosition(intent.position, options.activeBlockId, path, issues);
	if (!position) {
		return null;
	}
	return {
		kind: "block_move",
		blockId: intent.blockId,
		position,
		confidence: intent.confidence,
	};
}

function lowerConvertBlockIntent(intent: ConvertBlockIntent): BlockConvertPlan {
	return {
		kind: "block_convert",
		blockId: intent.blockId,
		newType: intent.newType,
		props: intent.props,
		confidence: intent.confidence,
	};
}

function lowerTextEditIntent(intent: TextEditIntent): TextEditPlan {
	return {
		kind: "text_edit",
		target: intent.target,
		operation: intent.operation,
		text: intent.text,
		confidence: intent.confidence,
	};
}

function lowerReviewBundleIntent(
	intent: ReviewBundleIntent,
	options: { activeBlockId: string | null },
	path: string,
	issues: StructuredIntentCompilationIssue[],
): ReviewBundlePlan | null {
	const plans = intent.changes
		.map((change, index) =>
			lowerStructuredIntent(change, options, `${path}.changes[${index}]`, issues),
		)
		.filter((plan): plan is DocumentMutationPlan => plan !== null);
	if (plans.length === 0) {
		issues.push({
			path: `${path}.changes`,
			code: "missing-field",
			message: "Review bundle produced no executable changes.",
		});
		return null;
	}
	return {
		kind: "review_bundle",
		label: intent.label,
		reason: intent.reason,
		plans,
		confidence: intent.confidence,
	};
}

function lowerInsertPosition(
	position: StructuredInsertPosition,
	activeBlockId: string | null,
	path: string,
	issues: StructuredIntentCompilationIssue[],
): Position | null {
	if (position === "start") {
		return "first";
	}
	if (position === "end") {
		return "last";
	}
	if (position === "before_active") {
		if (!activeBlockId) {
			issues.push({
				path: `${path}.position`,
				code: "missing-field",
				message: "Cannot resolve before_active without an active block.",
			});
			return null;
		}
		return { before: activeBlockId };
	}
	if (position === "after_active") {
		if (!activeBlockId) {
			issues.push({
				path: `${path}.position`,
				code: "missing-field",
				message: "Cannot resolve after_active without an active block.",
			});
			return null;
		}
		return { after: activeBlockId };
	}
	if ("beforeBlockId" in position) {
		return { before: position.beforeBlockId };
	}
	if ("afterBlockId" in position) {
		return { after: position.afterBlockId };
	}
	return {
		parent: position.parentId,
		index: position.index,
	};
}
