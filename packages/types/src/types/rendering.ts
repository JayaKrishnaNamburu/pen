import type { BlockHandle } from "./handles";
import type { Decoration } from "./decorations";

export interface BlockRenderContext {
  editable: boolean;
  selected: boolean;
  decorations: readonly Decoration[];
  ref: unknown;
}

export type BlockRenderer<Props = Record<string, unknown>> = (
  block: BlockHandle,
  ctx: BlockRenderContext,
) => unknown;
