import type { Editor } from "@pen/types";
import type { BlockRangeStreamingPreviewPlan } from "./streamingPreviewPlan";

export function mapStreamingBlockRangeTextOffset(
	editor: Editor,
	normalizedRange: BlockRangeStreamingPreviewPlan["normalizedRange"],
	charOffset: number,
): { blockId: string; offset: number } {
	const segments: Array<{
		blockId: string;
		startOffset: number;
		text: string;
	}> = [];

	if (
		normalizedRange.start.blockId === normalizedRange.end.blockId &&
		normalizedRange.middleBlockIds.length === 0
	) {
		const blockText =
			editor.getBlock(normalizedRange.start.blockId)?.textContent() ?? "";
		const from = Math.min(
			normalizedRange.start.offset,
			normalizedRange.end.offset,
		);
		const to = Math.max(
			normalizedRange.start.offset,
			normalizedRange.end.offset,
		);
		return {
			blockId: normalizedRange.start.blockId,
			offset: Math.min(to, from + Math.max(0, charOffset)),
		};
	}

	const startBlockText =
		editor.getBlock(normalizedRange.start.blockId)?.textContent() ?? "";
	segments.push({
		blockId: normalizedRange.start.blockId,
		startOffset: normalizedRange.start.offset,
		text: startBlockText.slice(normalizedRange.start.offset),
	});

	for (const blockId of normalizedRange.middleBlockIds) {
		segments.push({
			blockId,
			startOffset: 0,
			text: editor.getBlock(blockId)?.textContent() ?? "",
		});
	}

	const endBlockText =
		editor.getBlock(normalizedRange.end.blockId)?.textContent() ?? "";
	segments.push({
		blockId: normalizedRange.end.blockId,
		startOffset: 0,
		text: endBlockText.slice(0, normalizedRange.end.offset),
	});

	let cursor = 0;
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		if (!segment) {
			continue;
		}

		if (charOffset <= cursor + segment.text.length) {
			return {
				blockId: segment.blockId,
				offset: segment.startOffset + Math.max(0, charOffset - cursor),
			};
		}

		cursor += segment.text.length;
		if (index < segments.length - 1) {
			cursor += 1;
		}
	}

	const lastSegment = segments[segments.length - 1];
	if (!lastSegment) {
		return normalizedRange.end;
	}

	return {
		blockId: lastSegment.blockId,
		offset: lastSegment.startOffset + lastSegment.text.length,
	};
}
