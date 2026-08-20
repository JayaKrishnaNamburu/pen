import type { AIWorkingSetEnvelope } from "../../types";
import type { AITargetKind } from "../contracts";
import type { PlanConfidence } from "../planTypes";

export const STRUCTURED_INTENT_REQUEST_PREFIX =
	"pen:structured-intent-request/v1";

export type StructuredIntentKind =
	| "insert_block"
	| "update_block"
	| "move_block"
	| "convert_block"
	| "text_edit"
	| "review_bundle";

export type StructuredInsertPosition =
	| "before_active"
	| "after_active"
	| "start"
	| "end"
	| { beforeBlockId: string }
	| { afterBlockId: string }
	| { parentId: string; index: number };

export interface InsertBlockIntent {
	kind: "insert_block";
	blockId?: string;
	blockType: string;
	position: StructuredInsertPosition;
	props?: Record<string, unknown>;
	initialText?: string;
	confidence?: PlanConfidence;
}

export interface UpdateBlockIntent {
	kind: "update_block";
	blockId: string;
	props: Record<string, unknown>;
	confidence?: PlanConfidence;
}

export interface MoveBlockIntent {
	kind: "move_block";
	blockId: string;
	position: StructuredInsertPosition;
	confidence?: PlanConfidence;
}

export interface ConvertBlockIntent {
	kind: "convert_block";
	blockId: string;
	newType: string;
	props?: Record<string, unknown>;
	confidence?: PlanConfidence;
}

export interface TextEditIntent {
	kind: "text_edit";
	target: {
		blockId: string;
		range?: {
			startOffset: number;
			endOffset: number;
		};
	};
	operation: "replace" | "insert" | "append";
	text: string;
	confidence?: PlanConfidence;
}

export interface ReviewBundleIntent {
	kind: "review_bundle";
	label: string;
	reason: string;
	changes: StructuredIntent[];
	confidence?: PlanConfidence;
}

export type StructuredIntent =
	| InsertBlockIntent
	| UpdateBlockIntent
	| MoveBlockIntent
	| ConvertBlockIntent
	| TextEditIntent
	| ReviewBundleIntent;

export interface StructuredIntentParseIssue {
	path: string;
	code: "missing-field" | "invalid-shape" | "invalid-kind";
	message: string;
}

export interface StructuredIntentParseResult {
	intent: StructuredIntent | null;
	intentState: "drafted" | "validated" | "rejected";
	issues: StructuredIntentParseIssue[];
}

export interface StructuredIntentRequestEnvelope {
	version: 1;
	contract: "structured-intent";
	targetKind: AITargetKind;
	prompt: string;
	activeBlockId: string | null;
	contextSummary: unknown;
}

export interface StructuredIntentPromptConfig {
	prompt: string;
	targetKind: AITargetKind;
	activeBlockId: string | null;
	workingSet: AIWorkingSetEnvelope | null;
}
