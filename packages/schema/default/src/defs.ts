import type { BlockSchema, InlineSchema } from "@pen/types";

import { paragraph } from "./blocks/paragraph";
import { heading } from "./blocks/heading";
import { bulletListItem } from "./blocks/bulletListItem";
import { numberedListItem } from "./blocks/numberedListItem";
import { checkListItem } from "./blocks/checkListItem";
import { codeBlock } from "./blocks/codeBlock";
import { image } from "./blocks/image";
import { table } from "./blocks/table";
import { database } from "./blocks/database";
import { divider } from "./blocks/divider";
import { callout } from "./blocks/callout";
import { toggle } from "./blocks/toggle";
import { blockquote } from "./blocks/blockquote";
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
} from "./inlines/marks";
import { mention, inlineApp } from "./inlines/nodes";

export const defaultBlocks = [
  paragraph,
  heading,
  bulletListItem,
  numberedListItem,
  checkListItem,
  codeBlock,
  image,
  table,
  database,
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
