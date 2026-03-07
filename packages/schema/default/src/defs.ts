import type { BlockSchema, InlineSchema } from "@pen/types";

import { paragraph } from "./blocks/paragraph.js";
import { heading } from "./blocks/heading.js";
import { bulletListItem } from "./blocks/bulletListItem.js";
import { numberedListItem } from "./blocks/numberedListItem.js";
import { checkListItem } from "./blocks/checkListItem.js";
import { codeBlock } from "./blocks/codeBlock.js";
import { image } from "./blocks/image.js";
import { table } from "./blocks/table.js";
import { divider } from "./blocks/divider.js";
import { callout } from "./blocks/callout.js";
import { toggle } from "./blocks/toggle.js";
import { blockquote } from "./blocks/blockquote.js";
import {
  bold,
  italic,
  underline,
  strikethrough,
  code,
  link,
  highlight,
  textColor,
  backgroundColor,
} from "./inlines/marks.js";
import { mention, inlineApp } from "./inlines/nodes.js";

export const defaultBlocks = [
  paragraph,
  heading,
  bulletListItem,
  numberedListItem,
  checkListItem,
  codeBlock,
  image,
  table,
  divider,
  callout,
  toggle,
  blockquote,
] as BlockSchema[];

export const defaultInlines = [
  bold,
  italic,
  underline,
  strikethrough,
  code,
  link,
  highlight,
  textColor,
  backgroundColor,
  mention,
  inlineApp,
] as InlineSchema[];
