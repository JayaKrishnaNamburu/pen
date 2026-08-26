import type { PlanConfidence } from "../planTypes";
import type {
	StructuredInsertPosition,
	StructuredIntentParseIssue,
} from "./types";

export function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function readNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function readRequiredString(
	value: unknown,
	path: string,
	issues: StructuredIntentParseIssue[],
): string | null {
	const stringValue = readNonEmptyString(value);
	if (stringValue) {
		return stringValue;
	}
	issues.push({
		path,
		code: "missing-field",
		message: "Field is required.",
	});
	return null;
}

export function readConfidence(value: unknown): PlanConfidence | undefined {
	if (value == null) {
		return undefined;
	}
	if (isFiniteNumber(value)) {
		return { score: value };
	}
	const record = asRecord(value);
	if (!record) {
		return undefined;
	}
	const confidence: PlanConfidence = {};
	if (isFiniteNumber(record.score)) {
		confidence.score = record.score;
	}
	if (readNonEmptyString(record.reason)) {
		confidence.reason = record.reason as string;
	}
	return Object.keys(confidence).length > 0 ? confidence : undefined;
}

export function readStructuredPosition(
	value: unknown,
	path: string,
	issues: StructuredIntentParseIssue[],
): StructuredInsertPosition | null {
	if (
		value === "before_active" ||
		value === "after_active" ||
		value === "start" ||
		value === "end"
	) {
		return value;
	}
	const record = asRecord(value);
	if (!record) {
		issues.push({
			path,
			code: "invalid-shape",
			message: "Structured position is required.",
		});
		return null;
	}
	const beforeBlockId = readNonEmptyString(record.beforeBlockId);
	if (beforeBlockId) {
		return { beforeBlockId };
	}
	const afterBlockId = readNonEmptyString(record.afterBlockId);
	if (afterBlockId) {
		return { afterBlockId };
	}
	const parentId = readNonEmptyString(record.parentId);
	if (parentId && isFiniteNumber(record.index)) {
		return { parentId, index: record.index };
	}
	issues.push({
		path,
		code: "invalid-shape",
		message: "Structured position is invalid.",
	});
	return null;
}
