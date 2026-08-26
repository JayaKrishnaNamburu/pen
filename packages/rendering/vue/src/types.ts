import type { PendingBlock } from "@input/pen-core";
import type { AssetProvider, BlockHandle, Importer } from "@input/pen-types";
import type { VNode, VNodeChild } from "vue";

/**
 * Importers `PenEditor` installs for paste. Clipboard HTML falls back to
 * the built-in HTML importer when `html` is omitted; `markdown` and
 * `assets` are unhandled unless supplied, so pasted markdown arrives as
 * plain text and pasted files are dropped.
 */
export interface PasteImporters {
  html?: Importer<string, PendingBlock[]>;
  markdown?: Importer<string, PendingBlock[]>;
  assets?: AssetProvider;
}

/**
 * Options for the `renderInlineContent` callback a block renderer
 * receives. `as` picks the wrapper tag; `placeholder` overrides the
 * schema's empty-block copy for this block only.
 */
export interface PenInlineContentRenderOptions {
  as?: string;
  placeholder?: string;
}

/**
 * State and slots handed to a {@link PenBlockRenderer}. A custom
 * renderer must place `childNodes` for nested blocks to appear, and call
 * `renderInlineContent()` for the block's text to stay editable — Pen
 * owns that subtree's reconciliation, so hand-rendering the text
 * disconnects typing.
 */
export interface PenBlockRenderContext {
  readonly: boolean;
  selected: boolean;
  focused: boolean;
  childNodes: VNode[];
  renderInlineContent(options?: PenInlineContentRenderOptions): VNode;
}

/**
 * Renders one block type. Returning a falsy value falls through to the
 * built-in renderer for that type.
 */
export type PenBlockRenderer = (
  block: BlockHandle,
  context: PenBlockRenderContext,
) => VNodeChild;

/**
 * Per-block-type renderer overrides, keyed by schema block type and
 * passed to `PenEditor`'s `renderers` prop. Types left out keep their
 * built-in rendering.
 */
export type RendererOverrides = Partial<Record<string, PenBlockRenderer>>;
