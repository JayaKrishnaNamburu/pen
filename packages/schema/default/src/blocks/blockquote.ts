import { defineBlock, prop } from "@pen/types";

export const blockquote = defineBlock("blockquote", {
  props: {
    parentId: prop.string().optional().describe("Container parent block"),
  },
  content: "inline",
  fieldEditor: "richtext",
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
