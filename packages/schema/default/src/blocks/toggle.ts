import { defineBlock, prop } from "@pen/types";
import type { HTMLImportElement } from "@pen/types";

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
    fromMarkdown: (node) => {
      if (node.type !== "html") return null;
      const val = (node.value ?? "").trim();
      const match = val.match(
        /^<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>/i,
      );
      if (!match) return null;
      return {
        type: "toggle",
        props: { open: /\bopen\b/.test(val) },
        importContentSource: {
          markdownHtml: match[1].trim(),
        },
      };
    },
    toHTML: (block) => {
      const open = block.props.open ? " open" : "";
      return `<details${open}><summary>${block.content ?? ""}</summary></details>`;
    },
    fromHTML: (el: HTMLImportElement) => {
      if (el.tagName !== "details") return null;
      const summary = el.children?.find(
        (child): child is HTMLImportElement =>
          child.type === "element" && child.tagName === "summary",
      );
      return {
        type: "toggle",
        props: { open: el.hasAttribute("open") },
        importContentSource: summary
          ? { htmlElement: summary }
          : undefined,
        content: summary ? undefined : "",
      };
    },
  },
});
