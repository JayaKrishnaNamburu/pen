import type { DocumentOp, Editor } from "@input/pen-types";
import {
	areRecordValuesEqual,
	buildInlinePendingBlockInsertOps,
	resolveInsertionPosition,
	resolveLastInsertedBlockId,
} from "./state";
import type {
	InlineAlignmentStep,
	PendingInlineBlock,
} from "./types";

export function buildInlineBlockRewriteOps(
	targetBlock: NonNullable<ReturnType<Editor["getBlock"]>>,
	parsedBlock: PendingInlineBlock,
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	if (parsedBlock.type !== targetBlock.type) {
		ops.push({
			type: "set-props", blockId: targetBlock.id, props: { type: parsedBlock.type, ...parsedBlock.props },
		});
	} else if (!areRecordValuesEqual(targetBlock.props, parsedBlock.props)) {
		ops.push({
			type: "set-props",
			blockId: targetBlock.id,
			props: parsedBlock.props,
		});
	}

	const nextText = parsedBlock.content ?? "";
	const needsTextRewrite =
		targetBlock.textContent() !== nextText || (parsedBlock.marks?.length ?? 0) > 0;
	if (needsTextRewrite) {
		ops.push({
			type: "splice-text",
			blockId: targetBlock.id,
			from: 0,
				to: 0 + targetBlock.length(),
			insert: nextText,
		});
		for (const mark of parsedBlock.marks ?? []) {
			if (mark.end <= mark.start) {
				continue;
			}
			ops.push({
				type: "format-text",
				blockId: targetBlock.id,
				from: mark.start,
				to: mark.start + mark.end - mark.start,
				marks: { [mark.type]: mark.props ?? true },
			});
		}
	}

	return ops;
}

export function buildInlineAlignmentOps(
	alignment: InlineAlignmentStep[],
	targetBlocks: Array<NonNullable<ReturnType<Editor["getBlock"]>>>,
	parsedBlocks: PendingInlineBlock[],
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	const pendingInserts: PendingInlineBlock[] = [];
	let blockBefore: string | null = null;

	for (const step of alignment) {
		if (step.kind === "insert") {
			pendingInserts.push(parsedBlocks[step.parsedIndex!]!);
			continue;
		}

		if (step.kind === "substitute") {
			const targetBlock = targetBlocks[step.targetIndex!]!;
			if (pendingInserts.length > 0) {
				const insertOps = buildInlinePendingBlockInsertOps(
					pendingInserts,
					resolveInsertionPosition(blockBefore, targetBlock.id),
				);
				ops.push(...insertOps);
				blockBefore = resolveLastInsertedBlockId(insertOps) ?? blockBefore;
				pendingInserts.length = 0;
			}
			ops.push(
				...buildInlineBlockRewriteOps(
					targetBlock,
					parsedBlocks[step.parsedIndex!]!,
				),
			);
			blockBefore = targetBlock.id;
			continue;
		}

		ops.push({
			type: "delete-block",
			blockId: targetBlocks[step.targetIndex!]!.id,
		});
	}

	if (pendingInserts.length > 0) {
		ops.push(
			...buildInlinePendingBlockInsertOps(
				pendingInserts,
				resolveInsertionPosition(blockBefore, null),
			),
		);
	}

	return ops;
}

export function isInlineConvertiblePendingBlock(
	block: PendingInlineBlock,
): boolean {
	return (
		(block.children?.length ?? 0) === 0 &&
		block.type !== "table"
	);
}

export function isInlineConvertibleTargetBlock(
	block: NonNullable<ReturnType<Editor["getBlock"]>>,
): boolean {
	return block.children.length === 0 && block.type !== "table";
}
