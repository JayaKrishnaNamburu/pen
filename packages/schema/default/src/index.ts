export { defaultBlocks, defaultInlines } from "./defs";
export { createDefaultSchema } from "./registry";

import { createDefaultSchema } from "./registry";
export const defaultSchema = createDefaultSchema();

export { paragraph } from "./blocks/paragraph";
export { heading } from "./blocks/heading";
export { bulletListItem } from "./blocks/bulletListItem";
export { numberedListItem } from "./blocks/numberedListItem";
export { checkListItem } from "./blocks/checkListItem";
export { codeBlock } from "./blocks/codeBlock";
export { image } from "./blocks/image";
export { table } from "./blocks/table";
export { database } from "./blocks/database";
export { divider } from "./blocks/divider";
export { callout } from "./blocks/callout";
export { toggle } from "./blocks/toggle";
export { blockquote } from "./blocks/blockquote";

export {
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
export { mention, inlineApp } from "./inlines/nodes";
