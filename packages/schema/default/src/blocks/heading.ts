import { defineBlock, prop } from "@pen/types";

export const heading = defineBlock("heading", {
  props: {
    level: prop.enum([1, 2, 3, 4, 5, 6]).default(1).describe("Heading level"),
  },
  content: "inline",
  fieldEditor: "richtext",
  display: {
    title: "Heading",
    description: "Large section heading",
    group: "basic",
    aliases: ["h1", "h2", "h3", "h4", "h5", "h6", "title"],
  },
  serialize: {
    toMarkdown: (block) =>
      `${"#".repeat((block.props.level as number) ?? 1)} ${block.content ?? ""}`,
    toHTML: (block) => {
      const level = (block.props.level as number) ?? 1;
      return `<h${level}>${block.content ?? ""}</h${level}>`;
    },
  },
  normalize: (block) => {
    const level = (block.props.level as number) ?? 1;
    if (level < 1 || level > 6) {
      return {
        ...block,
        props: {
          ...block.props,
          level: Math.max(1, Math.min(6, level as number)),
        },
      };
    }
    return block;
  },
});
