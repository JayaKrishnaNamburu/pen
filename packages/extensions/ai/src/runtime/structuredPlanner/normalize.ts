import type { AITargetKind } from "../contracts";
import type { DocumentMutationPlan } from "../planTypes";
import { validateDocumentMutationPlanShape } from "../planValidation";
import {
	asRecord,
	isFiniteNumber,
	isRecordValue,
	normalizeConfidence,
	readNonEmptyString,
	readObjectField,
	readPartialObjectArray,
	readPositionField,
	readStringField,
} from "./primitives";

export function parsePartialStructuredPlan(
	value: string,
	targetKind: AITargetKind,
): DocumentMutationPlan | null {
	const kind = readStringField(value, "kind");
	if (!kind) {
		return null;
	}

	if (kind === "review_bundle") {
		const nestedPlans = readPartialObjectArray(value, "plans").filter((plan) =>
			validateDocumentMutationPlanShape(plan, { targetKind }).valid,
		) as DocumentMutationPlan[];
		if (nestedPlans.length === 0) {
			return null;
		}
		return {
			kind,
			label: readStringField(value, "label") ?? "Streaming review bundle",
			reason:
				readStringField(value, "reason") ??
				"Previewing mixed structural changes while the plan streams.",
			plans: nestedPlans,
		};
	}

	if (kind === "text_edit" && targetKind === "text") {
		const blockId = readStringField(value, "blockId");
		const operation = readStringField(value, "operation");
		const text = readStringField(value, "text");
		if (!blockId || !operation || text == null) {
			return null;
		}
		return {
			kind,
			target: { blockId },
			operation: operation as "replace" | "insert" | "append",
			text,
		};
	}

	if (targetKind === "block") {
		if (kind === "block_insert") {
			const blockId = readStringField(value, "blockId");
			const blockType = readStringField(value, "blockType");
			const position = readPositionField(value, "position");
			if (!blockType || !position) {
				return null;
			}
			return {
				kind,
				blockId: blockId ?? undefined,
				blockType,
				position,
				props:
					(readObjectField(value, "props") as Record<string, unknown> | null) ??
					undefined,
				initialText: readStringField(value, "initialText") ?? undefined,
			};
		}

		if (kind === "block_update") {
			const blockId = readStringField(value, "blockId");
			const props = readObjectField(value, "props");
			if (!blockId || !isRecordValue(props)) {
				return null;
			}
			return {
				kind,
				blockId,
				props,
			};
		}

		if (kind === "block_move") {
			const blockId = readStringField(value, "blockId");
			const position = readPositionField(value, "position");
			if (!blockId || !position) {
				return null;
			}
			return {
				kind,
				blockId,
				position,
			};
		}

		if (kind === "block_convert") {
			const blockId = readStringField(value, "blockId");
			const newType = readStringField(value, "newType");
			if (!blockId || !newType) {
				return null;
			}
			return {
				kind,
				blockId,
				newType,
				props:
					(readObjectField(value, "props") as Record<string, unknown> | null) ??
					undefined,
			};
		}
	}

	return null;
}

export function normalizeStructuredPlanCandidate(
	value: unknown,
	targetKind: AITargetKind,
): unknown {
	const record = asRecord(value);
	if (!record || typeof record.kind !== "string") {
		return value;
	}

	switch (record.kind) {
		case "review_bundle":
			return normalizeReviewBundlePlan(record, targetKind);
		case "block_insert":
			return normalizeBlockInsertPlan(record, targetKind);
		default:
			return value;
	}
}

export function normalizeReviewBundlePlan(
	record: Record<string, unknown>,
	targetKind: AITargetKind,
): Record<string, unknown> {
	const plans = Array.isArray(record.plans)
		? record.plans.map((plan) => normalizeStructuredPlanCandidate(plan, targetKind))
		: record.plans;
	return {
		...record,
		label: readNonEmptyString(record.label) ?? "Structured changes",
		reason:
			readNonEmptyString(record.reason) ??
			"Apply the requested structured changes.",
		confidence: normalizeConfidence(record.confidence),
		plans,
	};
}

export function normalizeBlockInsertPlan(
	record: Record<string, unknown>,
	targetKind: AITargetKind,
): Record<string, unknown> {
	void targetKind;
	const block = asRecord(record.block);
	const blockType =
		readNonEmptyString(record.blockType) ??
		readNonEmptyString(block?.type) ??
		readNonEmptyString(block?.kind);

	return {
		...record,
		...(blockType ? { blockType } : {}),
		confidence: normalizeConfidence(record.confidence),
		position: normalizePosition(record.position),
	};
}

export function normalizePosition(value: unknown): unknown {
	const position = asRecord(value);
	if (!position) {
		return value;
	}
	const parentId = readNonEmptyString(position.parentId);
	if (parentId && isFiniteNumber(position.index)) {
		if (parentId === "root") {
			return position.index <= 0 ? "first" : "last";
		}
		return {
			parent: parentId,
			index: position.index,
		};
	}
	if (
		parentId === "root" &&
		("after" in position || "before" in position) &&
		!isFiniteNumber(position.index)
	) {
		return "last";
	}
	const relativeTo = readNonEmptyString(position.relativeTo);
	const placement = readNonEmptyString(position.placement);
	if (relativeTo === "active") {
		if (placement === "before") {
			return "first";
		}
		if (placement === "after") {
			return "last";
		}
	}
	return value;
}
