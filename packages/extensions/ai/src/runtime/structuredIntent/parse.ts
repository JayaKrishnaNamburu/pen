import type { AITargetKind } from "../contracts";
import {
	asRecord,
	isFiniteNumber,
	readConfidence,
	readNonEmptyString,
	readRequiredString,
	readStructuredPosition,
} from "./primitives";
import type {
	ConvertBlockIntent,
	InsertBlockIntent,
	MoveBlockIntent,
	ReviewBundleIntent,
	StructuredIntent,
	StructuredIntentKind,
	StructuredIntentParseIssue,
	StructuredIntentParseResult,
	TextEditIntent,
	UpdateBlockIntent,
} from "./types";

export function parseStructuredIntentResult(
	value: unknown,
	targetKind: AITargetKind,
): StructuredIntentParseResult {
	const issues: StructuredIntentParseIssue[] = [];
	const intent = readStructuredIntent(value, "intent", issues, {
		allowPartial: false,
		targetKind,
	});
	return {
		intent,
		intentState: intent ? "validated" : "rejected",
		issues,
	};
}

export function parseStructuredIntentPreview(
	value: unknown,
	targetKind: AITargetKind,
): StructuredIntentParseResult | null {
	const issues: StructuredIntentParseIssue[] = [];
	const intent = readStructuredIntent(value, "intent", issues, {
		allowPartial: true,
		targetKind,
	});
	if (!intent) {
		return null;
	}
	return {
		intent,
		intentState: issues.length === 0 ? "validated" : "drafted",
		issues,
	};
}

export function resolveAllowedStructuredIntentKinds(
	targetKind: AITargetKind,
): StructuredIntentKind[] {
	if (targetKind === "text") {
		return ["text_edit"];
	}
	return [
		"insert_block",
		"update_block",
		"move_block",
		"convert_block",
		"review_bundle",
	];
}

export function stringifyContextSummary(value: unknown): string {
	try {
		return JSON.stringify(value ?? null);
	} catch {
		// unstringifiable context becomes a null token.
		return "null";
	}
}

export function readStructuredIntent(
	value: unknown,
	path: string,
	issues: StructuredIntentParseIssue[],
	options: {
		allowPartial: boolean;
		targetKind: AITargetKind;
	},
): StructuredIntent | null {
	if (options.targetKind === "table") {
		issues.push({
			path,
			code: "invalid-kind",
			message:
				"Structured table intents are not supported. Use the markdown authoring lane for tables.",
		});
		return null;
	}
	const record = asRecord(value);
	if (!record) {
		issues.push({
			path,
			code: "invalid-shape",
			message: "Structured intent must be an object.",
		});
		return null;
	}
	const kind = readNonEmptyString(record.kind);
	if (!kind) {
		issues.push({
			path: `${path}.kind`,
			code: "missing-field",
			message: "Structured intent kind is required.",
		});
		return null;
	}
	switch (kind) {
		case "insert_block":
			return readInsertBlockIntent(record, path, issues, options.allowPartial);
		case "update_block":
			return readUpdateBlockIntent(record, path, issues, options.allowPartial);
		case "move_block":
			return readMoveBlockIntent(record, path, issues, options.allowPartial);
		case "convert_block":
			return readConvertBlockIntent(record, path, issues, options.allowPartial);
		case "text_edit":
			return readTextEditIntent(record, path, issues, options.allowPartial);
		case "review_bundle":
			return readReviewBundleIntent(record, path, issues, options);
		default:
			issues.push({
				path: `${path}.kind`,
				code: "invalid-kind",
				message: `Unsupported structured intent kind "${kind}".`,
			});
			return null;
	}
}

export function readInsertBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): InsertBlockIntent | null {
	const blockType = readRequiredString(
		record.blockType,
		`${path}.blockType`,
		issues,
		allowPartial,
	);
	const position = readStructuredPosition(
		record.position,
		`${path}.position`,
		issues,
		allowPartial,
	);
	if (!blockType || !position) {
		return null;
	}
	if (blockType === "table") {
		if (!allowPartial) {
			issues.push({
				path: `${path}.blockType`,
				code: "invalid-kind",
				message:
					"Structured table intents are not supported. Use the markdown authoring lane for tables.",
			});
		}
		return null;
	}
	return {
		kind: "insert_block",
		blockId: readNonEmptyString(record.blockId) ?? undefined,
		blockType,
		position,
		props: asRecord(record.props) ?? undefined,
		initialText: readNonEmptyString(record.initialText) ?? undefined,
		confidence: readConfidence(record.confidence),
	};
}

export function readUpdateBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): UpdateBlockIntent | null {
	const blockId = readRequiredString(
		record.blockId,
		`${path}.blockId`,
		issues,
		allowPartial,
	);
	const props = asRecord(record.props);
	if (!blockId || !props) {
		if (!props && !allowPartial) {
			issues.push({
				path: `${path}.props`,
				code: "invalid-shape",
				message: "Block update props must be an object.",
			});
		}
		return null;
	}
	return {
		kind: "update_block",
		blockId,
		props,
		confidence: readConfidence(record.confidence),
	};
}

export function readMoveBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): MoveBlockIntent | null {
	const blockId = readRequiredString(
		record.blockId,
		`${path}.blockId`,
		issues,
		allowPartial,
	);
	const position = readStructuredPosition(
		record.position,
		`${path}.position`,
		issues,
		allowPartial,
	);
	if (!blockId || !position) {
		return null;
	}
	return {
		kind: "move_block",
		blockId,
		position,
		confidence: readConfidence(record.confidence),
	};
}

export function readConvertBlockIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): ConvertBlockIntent | null {
	const blockId = readRequiredString(
		record.blockId,
		`${path}.blockId`,
		issues,
		allowPartial,
	);
	const newType = readRequiredString(
		record.newType,
		`${path}.newType`,
		issues,
		allowPartial,
	);
	if (!blockId || !newType) {
		return null;
	}
	return {
		kind: "convert_block",
		blockId,
		newType,
		props: asRecord(record.props) ?? undefined,
		confidence: readConfidence(record.confidence),
	};
}

export function readTextEditIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	allowPartial: boolean,
): TextEditIntent | null {
	const target = asRecord(record.target);
	const blockId = readRequiredString(
		target?.blockId,
		`${path}.target.blockId`,
		issues,
		allowPartial,
	);
	const operation = readRequiredString(
		record.operation,
		`${path}.operation`,
		issues,
		allowPartial,
	) as TextEditIntent["operation"] | null;
	const text = readRequiredString(
		record.text,
		`${path}.text`,
		issues,
		allowPartial,
	);
	if (!blockId || !operation || !text) {
		return null;
	}
	const rangeRecord = asRecord(target?.range);
	return {
		kind: "text_edit",
		target: {
			blockId,
			range:
				rangeRecord &&
				isFiniteNumber(rangeRecord.startOffset) &&
				isFiniteNumber(rangeRecord.endOffset)
					? {
						startOffset: rangeRecord.startOffset,
						endOffset: rangeRecord.endOffset,
					}
					: undefined,
		},
		operation,
		text,
		confidence: readConfidence(record.confidence),
	};
}

export function readReviewBundleIntent(
	record: Record<string, unknown>,
	path: string,
	issues: StructuredIntentParseIssue[],
	options: { allowPartial: boolean; targetKind: AITargetKind },
): ReviewBundleIntent | null {
	const changes = Array.isArray(record.changes)
		? record.changes
			.map((entry, index) =>
				readStructuredIntent(entry, `${path}.changes[${index}]`, issues, options),
			)
			.filter((entry): entry is StructuredIntent => entry !== null)
		: [];
	if (changes.length === 0 && !options.allowPartial) {
		issues.push({
			path: `${path}.changes`,
			code: "missing-field",
			message: "Review bundle changes are required.",
		});
		return null;
	}
	return {
		kind: "review_bundle",
		label:
			readNonEmptyString(record.label) ??
			(options.allowPartial ? "Streaming structured changes" : ""),
		reason:
			readNonEmptyString(record.reason) ??
			(options.allowPartial ? "Streaming structured preview." : ""),
		changes,
		confidence: readConfidence(record.confidence),
	};
}
