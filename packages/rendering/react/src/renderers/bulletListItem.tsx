import React from "react";
import type { BlockHandle, BlockRenderContext } from "@input/pen-types";
import {
	ListItemLayout,
	type ListItemHostAttributes,
} from "../utils/listItemLayout";

export function BulletListItemRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): React.ReactElement<ListItemHostAttributes> {
	const indent = (block.props?.indent as number) ?? 0;

	return (
		<ListItemLayout
			ref={ctx.ref as React.Ref<HTMLDivElement>}
			blockId={block.id}
			blockType="bulletListItem"
			indent={indent}
			selected={ctx.selected}
			decorations={ctx.decorations}
			marker={
				<span
					data-pen-list-marker=""
					// Justified decorative list marker
					aria-hidden="true"
				>
					•
				</span>
			}
		/>
	);
}
