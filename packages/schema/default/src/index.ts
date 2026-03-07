export { defaultBlocks, defaultInlines } from "./defs.js";
export { createDefaultSchema } from "./registry.js";

import { createDefaultSchema } from "./registry.js";
export const defaultSchema = createDefaultSchema();

export { paragraph } from "./blocks/paragraph.js";
export { heading } from "./blocks/heading.js";
export { bulletListItem } from "./blocks/bulletListItem.js";
export { numberedListItem } from "./blocks/numberedListItem.js";
export { checkListItem } from "./blocks/checkListItem.js";
export { codeBlock } from "./blocks/codeBlock.js";
export { image } from "./blocks/image.js";
export { table } from "./blocks/table.js";
export { divider } from "./blocks/divider.js";
export { callout } from "./blocks/callout.js";
export { toggle } from "./blocks/toggle.js";
export { blockquote } from "./blocks/blockquote.js";

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
} from "./inlines/marks.js";
export { mention, inlineApp } from "./inlines/nodes.js";
