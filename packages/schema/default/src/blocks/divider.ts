import { defineBlock } from "@pen/types";

export const divider = defineBlock("divider", {
  content: "none",
  fieldEditor: "none",
  display: {
    title: "Divider",
    description: "Visual separator",
    group: "basic",
    aliases: ["hr", "separator", "line"],
  },
  serialize: {
    toMarkdown: () => "---",
    toHTML: () => "<hr />",
  },
});
