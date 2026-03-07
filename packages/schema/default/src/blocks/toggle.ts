import { defineBlock, prop } from "@pen/types";

export const toggle = defineBlock("toggle", {
  props: {
    open: prop
      .boolean()
      .default(false)
      .describe("Whether the toggle content is expanded"),
    parentId: prop.string().optional().describe("Container parent block"),
  },
  content: "inline",
  fieldEditor: "richtext",
  display: {
    title: "Toggle",
    description: "Collapsible content block",
    group: "basic",
    aliases: ["collapsible", "accordion", "details"],
  },
  serialize: {
    toMarkdown: (block) =>
      `<details>\n<summary>${block.content ?? ""}</summary>\n</details>`,
    toHTML: (block) => {
      const open = block.props.open ? " open" : "";
      return `<details${open}><summary>${block.content ?? ""}</summary></details>`;
    },
  },
});
