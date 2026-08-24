import type { DocumentOp, Editor } from "@input/pen-types";
import { generateId } from "@input/pen-types";
import type {
	PendingInlineBlock,
	PlanExecutionContext,
	PlanExecutionIssue,
	PlanExecutionResult,
	VirtualBlockState,
} from "./types";

export function createVirtualBlockState(
	blockType: string,
	props: Record<string, unknown> = {},
	text: string | number = 0,
): VirtualBlockState {
	const textLength = typeof text === "number" ? text : text.length;
	return {
		type: blockType,
		props,
		textLength,
	};
}

export function resolveBlockState(
	editor: Editor,
	context: PlanExecutionContext,
	blockId: string,
): VirtualBlockState | null {
	const virtualBlock = context.virtualBlocks.get(blockId) ?? null;
	if (virtualBlock) {
		return virtualBlock;
	}

	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	return createVirtualBlockState(
		block.type,
		{ ...block.props },
		block.length(),
	);
}

export function withIssue(
	path: string,
	code: PlanExecutionIssue["code"],
	message: string,
): PlanExecutionResult {
	return {
		ops: [],
		issues: [{ path, code, message }],
		reviewSafe: false,
	};
}

export function areRecordValuesEqual(
	left: Record<string, unknown>,
	right: Record<string, unknown>,
): boolean {
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	if (leftEntries.length !== rightEntries.length) {
		return false;
	}

	return leftEntries.every(([key, value]) => {
		if (!(key in right)) {
			return false;
		}
		return JSON.stringify(value) === JSON.stringify(right[key]);
	});
}

export function buildInlinePendingBlockInsertOps(
	blocks: PendingInlineBlock[],
	position: { before: string } | { after: string } | "last",
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	let currentPosition = position;
	for (const block of blocks) {
		const blockId = generateId();
		ops.push({
			type: "insert-block",
			blockId,
			blockType: block.type,
			props: block.props,
			position: currentPosition,
		});
		if ((block.content ?? "").length > 0) {
			ops.push({
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: block.content!,
			});
		}
		for (const mark of block.marks ?? []) {
			if (mark.end <= mark.start) {
				continue;
			}
			ops.push({
				type: "format-text",
				blockId,
				from: mark.start,
				to: mark.start + mark.end - mark.start,
				marks: { [mark.type]: mark.props ?? true },
			});
		}
		currentPosition = { after: blockId };
	}
	return ops;
}

export function resolveLastInsertedBlockId(ops: DocumentOp[]): string | null {
	for (let index = ops.length - 1; index >= 0; index -= 1) {
		const op = ops[index]!;
		if (op.type === "insert-block") {
			return op.blockId;
		}
	}
	return null;
}

export function resolveInsertionPosition(
	blockBefore: string | null,
	blockAfter: string | null,
): { before: string } | { after: string } | "last" {
	if (blockBefore) {
		return { after: blockBefore };
	}
	if (blockAfter) {
		return { before: blockAfter };
	}
	return "last";
}
