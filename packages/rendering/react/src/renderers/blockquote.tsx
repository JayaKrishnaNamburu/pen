import React from "react";
import type { BlockHandle, BlockRenderContext } from "@input/pen-types";
import { InlineContent } from "../primitives/editor/inlineContent";
import { BlockChildren } from "../primitives/editor/blockChildren";

export function BlockquoteRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): React.ReactElement {
	return (
		<blockquote
			ref={ctx.ref as React.Ref<HTMLQuoteElement>}
			data-block-type="blockquote"
			data-selected={ctx.selected ? "" : undefined}
		>
			<InlineContent blockId={block.id} decorations={ctx.decorations} />
			<BlockChildren
				parentBlockId={block.id}
				containerProps={{ "data-pen-blockquote-children": "" }}
			/>
		</blockquote>
	);
}
