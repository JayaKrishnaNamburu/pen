import type { DocumentRange, Editor } from "@input/pen-types";
import { normalizeFlowMarkdownOutput } from "../runtime/flowMarkdown";
import { toStreamingPreviewText } from "../runtime/streamingPreviewText";
import type { AIStreamingReviewPreviewTarget } from "../types";

/**
 * Display text for a markdown payload still arriving on the review surface.
 *
 * The commit normalizes before parsing, so a preview that skipped
 * normalization would show fences and annotations that accept then drops —
 * the fidelity RS6 measures is between the preview and what accept writes,
 * not between the preview and the raw model output.
 */
export function markdownStreamingPreviewText(text: string): string {
	return toStreamingPreviewText(normalizeFlowMarkdownOutput(text));
}

/**
 * Which region a streaming markdown block preview covers.
 *
 * The commit chooses between replacing a named span of blocks, replacing the
 * target block, and appending at an offset; the preview has to name the same
 * region or it strikes through text the commit will keep.
 */
export function resolveMarkdownPreviewTarget(
	editor: Editor,
	target: {
		blockId: string;
		offset: number;
		replaceTargetBlock: boolean;
		replaceBlockIds?: readonly string[];
	},
): AIStreamingReviewPreviewTarget {
	const replaceBlockIds = target.replaceBlockIds ?? [];
	if (replaceBlockIds.length > 0) {
		const endBlockId = replaceBlockIds[replaceBlockIds.length - 1]!;
		return {
			kind: "block-range",
			start: { blockId: replaceBlockIds[0]!, offset: 0 },
			end: {
				blockId: endBlockId,
				offset: blockTextLength(editor, endBlockId),
			},
			blockIds: [...replaceBlockIds],
		};
	}
	if (target.replaceTargetBlock) {
		return {
			kind: "text-range",
			blockId: target.blockId,
			from: 0,
			to: blockTextLength(editor, target.blockId),
		};
	}
	return {
		kind: "insertion-point",
		blockId: target.blockId,
		offset: target.offset,
	};
}

/**
 * Which region a streaming selection-rewrite preview covers.
 *
 * A rewrite replaces the selection, so the preview strikes exactly the
 * selected text. A selection spanning blocks cannot say that as one text
 * range, and naming only its first block would leave the rest of the
 * selection looking untouched while the replacement grows. Endpoints
 * missing from blockOrder cannot be named either; callers skip the preview.
 */
export function resolveSelectionPreviewTarget(
	editor: Editor,
	range: Pick<DocumentRange, "start" | "end">,
): AIStreamingReviewPreviewTarget | null {
	if (range.start.blockId === range.end.blockId) {
		return {
			kind: "text-range",
			blockId: range.start.blockId,
			from: range.start.offset,
			to: range.end.offset,
		};
	}
	const blockOrder = editor.documentState.blockOrder;
	const startIndex = blockOrder.indexOf(range.start.blockId);
	const endIndex = blockOrder.indexOf(range.end.blockId);
	if (startIndex < 0 || endIndex < 0) {
		return null;
	}
	return {
		kind: "block-range",
		start: { blockId: range.start.blockId, offset: range.start.offset },
		end: { blockId: range.end.blockId, offset: range.end.offset },
		blockIds: blockOrder
			.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1)
			.filter((blockId) => editor.getBlock(blockId) != null),
	};
}

function blockTextLength(editor: Editor, blockId: string): number {
	return editor.getBlock(blockId)?.textContent().length ?? 0;
}
