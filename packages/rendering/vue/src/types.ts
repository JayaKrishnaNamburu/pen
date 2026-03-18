import type { PendingBlock } from "@pen/core";
import type { AssetProvider, BlockHandle, Importer } from "@pen/types";
import type { VNode, VNodeChild } from "vue";

export interface PasteImporters {
  html?: Importer<string, PendingBlock[]>;
  markdown?: Importer<string, PendingBlock[]>;
  assets?: AssetProvider;
}

export interface PenInlineContentRenderOptions {
  as?: string;
  placeholder?: string;
}

export interface PenBlockRenderContext {
  readonly: boolean;
  selected: boolean;
  focused: boolean;
  childNodes: VNode[];
  renderInlineContent(options?: PenInlineContentRenderOptions): VNode;
}

export type PenBlockRenderer = (
  block: BlockHandle,
  context: PenBlockRenderContext,
) => VNodeChild;

export type RendererOverrides = Partial<Record<string, PenBlockRenderer>>;
