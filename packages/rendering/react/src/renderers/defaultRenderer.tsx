import React from "react";
import type { BlockHandle, BlockRenderContext } from "@input/pen-types";
import { isDevelopmentEnvironment } from "../utils/environment";

const shouldShowDevWarnings = isDevelopmentEnvironment();

export function DefaultRenderer(
	block: BlockHandle,
	ctx: BlockRenderContext,
): React.ReactElement {
	return (
		<div
			ref={ctx.ref as React.Ref<HTMLDivElement>}
			data-block-type={block.type}
			data-selected={ctx.selected ? "" : undefined}
			data-unknown-block=""
			contentEditable={false}
			suppressContentEditableWarning
		>
			<span data-pen-unknown-type="">{block.type}</span>
			{shouldShowDevWarnings && (
				<pre data-pen-unknown-props="">
					{JSON.stringify(block.props, null, 2)}
				</pre>
			)}
		</div>
	);
}
