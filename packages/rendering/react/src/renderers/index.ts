import type { BlockHandle, BlockRenderContext, BlockRenderer } from "@pen/core";
import { ParagraphRenderer } from "./paragraph.js";
import { HeadingRenderer } from "./heading.js";
import { BulletListItemRenderer } from "./bulletListItem.js";
import { NumberedListItemRenderer } from "./numberedListItem.js";
import { CheckListItemRenderer } from "./checkListItem.js";
import { CodeBlockRenderer } from "./codeBlock.js";
import { ImageRenderer } from "./image.js";
import { TableRenderer } from "./table.js";
import { DividerRenderer } from "./divider.js";
import { CalloutRenderer } from "./callout.js";
import { ToggleRenderer } from "./toggle.js";
import { BlockquoteRenderer } from "./blockquote.js";
import { DefaultRenderer } from "./defaultRenderer.js";

const RENDERER_MAP: Record<string, BlockRenderer> = {
  paragraph: ParagraphRenderer,
  heading: HeadingRenderer,
  bulletListItem: BulletListItemRenderer,
  numberedListItem: NumberedListItemRenderer,
  checkListItem: CheckListItemRenderer,
  codeBlock: CodeBlockRenderer,
  image: ImageRenderer,
  table: TableRenderer,
  divider: DividerRenderer,
  callout: CalloutRenderer,
  toggle: ToggleRenderer,
  blockquote: BlockquoteRenderer,
};

export function resolveRenderer(blockType: string): BlockRenderer {
  return RENDERER_MAP[blockType] ?? DefaultRenderer;
}

export function registerRenderer(
  blockType: string,
  renderer: BlockRenderer,
): void {
  RENDERER_MAP[blockType] = renderer;
}

export {
  ParagraphRenderer,
  HeadingRenderer,
  BulletListItemRenderer,
  NumberedListItemRenderer,
  CheckListItemRenderer,
  CodeBlockRenderer,
  ImageRenderer,
  TableRenderer,
  DividerRenderer,
  CalloutRenderer,
  ToggleRenderer,
  BlockquoteRenderer,
  DefaultRenderer,
};
