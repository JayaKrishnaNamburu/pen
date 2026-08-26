import type { DocumentOp } from "@input/pen-types";
import type {
	AIMutationReceipt,
	AIMutationReceiptEvidence,
	AIMutationReceiptStatus,
} from "../types";
import { generateId } from "@input/pen-types";

export interface BuildMutationReceiptInput {
	status: AIMutationReceiptStatus;
	ops?: readonly DocumentOp[];
	issues?: readonly string[];
}

export function buildMutationReceipt(
	input: BuildMutationReceiptInput,
): AIMutationReceipt {
	return {
		id: generateId(),
		status: input.status,
		evidence: buildMutationEvidence(input.ops ?? []),
		issues: [...(input.issues ?? [])],
	};
}

function buildMutationEvidence(
	ops: readonly DocumentOp[],
): AIMutationReceiptEvidence {
	const affectedBlockIds = new Set<string>();
	const createdBlockIds = new Set<string>();

	for (const op of ops) {
		const blockId = readBlockId(op);
		if (blockId) {
			affectedBlockIds.add(blockId);
		}
		if (op.type === "insert-block") {
			createdBlockIds.add(op.blockId);
		}
	}

	return {
		commitId: generateId(),
		opsCount: ops.length,
		affectedBlockIds: [...affectedBlockIds],
		createdBlockIds: [...createdBlockIds],
	};
}

function readBlockId(op: DocumentOp): string | null {
	return "blockId" in op && typeof op.blockId === "string"
		? op.blockId
		: null;
}