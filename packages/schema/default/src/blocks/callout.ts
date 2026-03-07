import { defineBlock, prop } from "@pen/types";

export const callout = defineBlock("callout", {
  props: {
    type: prop
      .enum(["info", "warning", "error"])
      .default("info")
      .describe("Callout severity"),
    parentId: prop.string().optional().describe("Container parent block"),
  },
  content: "inline",
  fieldEditor: "richtext",
  display: {
    title: "Callout",
    description: "Highlighted callout box",
    group: "basic",
    aliases: ["alert", "notice", "admonition"],
  },
  serialize: {
    toMarkdown: (block) => {
      const prefix =
        block.props.type === "warning"
          ? "> **Warning:**"
          : block.props.type === "error"
            ? "> **Error:**"
            : "> **Note:**";
      return `${prefix} ${block.content ?? ""}`;
    },
    toHTML: (block) => {
      const type = block.props.type ?? "info";
      return `<div class="callout callout-${type}">${block.content ?? ""}</div>`;
    },
  },
});
