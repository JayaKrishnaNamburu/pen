import React from "react";
import type { BlockHandle, BlockRenderContext } from "@pen/core";
import { InlineContent } from "../primitives/editor/inlineContent.js";

export function NumberedListItemRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): React.ReactElement {
	const indent = (block.props?.indent as number) ?? 0;
	const startOverride = block.props?.start as number | undefined;

	// Pen uses a flat block model instead of nested <ol> wrappers, so we walk
	// backward through siblings to compute the counter value. The counter resets
	// when a non-numbered-list block is encountered at the same indent level.
	const counterValue = startOverride ?? computeCounter(block, indent);

	return (
		<div
			ref={ctx.ref as React.Ref<HTMLDivElement>}
			data-block-type="numberedListItem"
			data-indent={indent}
			data-counter={counterValue}
			data-selected={ctx.selected || undefined}
			style={{ paddingLeft: `${indent * 24}px` }}
		>
			<span data-pen-list-marker="" aria-hidden="true">
				{counterValue}.
			</span>
			<InlineContent blockId={block.id} />
		</div>
	);
}

/**
 * Walk backward through preceding blocks to compute the list number.
 * Resets when hitting a block that is not a numberedListItem at the same indent.
 */
function computeCounter(block: BlockHandle, indent: number): number {
	let count = 1;
	let prev = block.prev;
	while (prev) {
		if (prev.type !== "numberedListItem") break;

		const prevIndent = (prev.props?.indent as number) ?? 0;
		if (prevIndent < indent) break;
		if (prevIndent === indent) {
			const prevStart = prev.props?.start as number | undefined;
			if (prevStart != null) {
				count += prevStart - 1;
				break;
			}
			count++;
		}
		prev = prev.prev;
	}
	return count;
}
