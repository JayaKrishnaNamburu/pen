import { defineBlock, prop } from "@pen/types";

export const subdocument = defineBlock("subdocument", {
  props: {
    title: prop.string().default("Subdocument").describe("Nested document title"),
    subdocumentGuid: prop
      .string()
      .optional()
      .describe("Stable Yjs guid for the nested subdocument"),
  },
  content: "subdocument",
  fieldEditor: "none",
  display: {
    title: "Subdocument",
    description: "Nested Pen editor backed by a Yjs subdocument",
    group: "advanced",
    aliases: ["subdoc", "nested document"],
  },
  serialize: {
    toMarkdown: (block) =>
      `<!-- pen-subdocument:${String(block.props.subdocumentGuid ?? "")} -->`,
    toHTML: (block) =>
      `<div data-pen-subdocument="${String(block.props.subdocumentGuid ?? "")}"></div>`,
  },
});
