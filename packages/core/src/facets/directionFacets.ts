import type { BlockHandle, Editor } from "@input/pen-types";

import type { BlockDirection } from "../direction/firstStrong";
import { defineFacet } from "./defineFacet";

export type BlockDirectionResolver = (
	block: BlockHandle,
	editor: Editor,
) => BlockDirection | null | undefined;

export const blockDirectionFacet = defineFacet<
	BlockDirectionResolver,
	readonly BlockDirectionResolver[]
>({
	name: "pen.blockDirection",
	combine: (inputs) => inputs,
});

export const defaultDirectionFacet = defineFacet<
	BlockDirection,
	BlockDirection
>({
	name: "pen.defaultDirection",
	combine: (inputs) => inputs[0] ?? "ltr",
});
