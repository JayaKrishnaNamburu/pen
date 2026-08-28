import {
	defineBlock,
	prop,
} from "@input/pen-core";
import { directionProp } from "../directionProp";

export const blockquote = defineBlock("blockquote", {
  props: {
    parentId: prop.string().optional().describe("Container parent block"),
    direction: directionProp,
  },
  content: "inline",
  fieldEditor: "richtext",
  isContainer: true,
  display: {
    title: "Quote",
    description: "Block quotation",
    group: "basic",
    aliases: ["quote", "blockquote", "pullquote"],
  },
  serialize: {
    toMarkdown: (block) => `> ${block.content ?? ""}`,
    toHTML: (block) => `<blockquote>${block.content ?? ""}</blockquote>`,
  },
});
