import type { Editor } from "../types/editor";
import type {
	ModelOperationScopedRangeTarget,
	ModelOperationSelectionTarget,
} from "../types/tools";

export type ModelOperationRangeTarget =
	| ModelOperationSelectionTarget
	| ModelOperationScopedRangeTarget;

export function isScopedSelectionTarget(
	target: ModelOperationRangeTarget,
): target is ModelOperationScopedRangeTarget {
	return target.kind === "scoped-range";
}

export function resolveSelectionTargetBlockIds(
	editor: Editor,
	target: ModelOperationRangeTarget,
): string[] {
	const scopedBlockIds = ("blockIds" in target ? target.blockIds : undefined)?.filter(
		(blockId, index, allBlockIds) =>
			allBlockIds.indexOf(blockId) === index && editor.getBlock(blockId) != null,
	);
	if ((scopedBlockIds?.length ?? 0) > 0) {
		return [...(scopedBlockIds ?? [])];
	}

	const blockOrder = editor.documentState.blockOrder;
	const anchorIndex = blockOrder.indexOf(target.anchor.blockId);
	const focusIndex = blockOrder.indexOf(target.focus.blockId);
	if (anchorIndex < 0 || focusIndex < 0) {
		return [];
	}
	const [startIndex, endIndex] =
		anchorIndex <= focusIndex
			? [anchorIndex, focusIndex]
			: [focusIndex, anchorIndex];
	return blockOrder
		.slice(startIndex, endIndex + 1)
		.filter((blockId) => editor.getBlock(blockId) != null);
}

export function renderSelectionTargetText(
	editor: Editor,
	target: ModelOperationRangeTarget,
	options?: {
		resolved?: boolean;
	},
): string {
	const blockIds = resolveSelectionTargetBlockIds(editor, target);
	if (blockIds.length === 0) {
		return target.sourceText;
	}
	const blockOrder = editor.documentState.blockOrder;
	const anchorIndex = blockOrder.indexOf(target.anchor.blockId);
	const focusIndex = blockOrder.indexOf(target.focus.blockId);
	const anchorBeforeFocus =
		anchorIndex < focusIndex ||
		(anchorIndex === focusIndex && target.anchor.offset <= target.focus.offset);
	const startPoint = anchorBeforeFocus ? target.anchor : target.focus;
	const endPoint = anchorBeforeFocus ? target.focus : target.anchor;

	return blockIds
		.map((blockId, index) => {
			const block = editor.getBlock(blockId);
			if (!block) {
				return "";
			}
			const fullText = options?.resolved
				? block.textContent({ resolved: true })
				: block.textContent();
			const startOffset = index === 0 ? startPoint.offset : 0;
			const endOffset =
				index === blockIds.length - 1 ? endPoint.offset : fullText.length;
			return fullText.slice(startOffset, endOffset);
		})
		.join("\n");
}

export function renderSelectionTargetBlockText(
	editor: Editor,
	target: ModelOperationRangeTarget,
	options?: {
		resolved?: boolean;
	},
): string {
	const blockIds = resolveSelectionTargetBlockIds(editor, target);
	if (blockIds.length === 0) {
		return target.sourceText;
	}
	return blockIds
		.map((blockId) => {
			const block = editor.getBlock(blockId);
			if (!block) {
				return "";
			}
			return options?.resolved
				? block.textContent({ resolved: true })
				: block.textContent();
		})
		.join("\n");
}
