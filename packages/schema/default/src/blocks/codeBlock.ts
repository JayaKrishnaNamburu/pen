import { defineBlock, prop } from "@input/pen-types";
import { directionProp } from "../directionProp";
import { escapeHtml } from "../escapeHtml";

export const codeBlock = defineBlock("codeBlock", {
  props: {
    language: prop
      .string()
      .optional()
      .describe("Programming language for syntax highlighting"),
    direction: directionProp,
  },
  content: "inline",
  fieldEditor: "code",
  authoring: {
    selectionRole: "delegated",
  },
  display: {
    title: "Code Block",
    description: "Code with syntax highlighting",
    group: "basic",
    aliases: ["code", "pre", "monospace"],
  },
  serialize: {
    toMarkdown: (block) => {
      const lang = block.props.language ?? "";
      return `\`\`\`${lang}\n${block.content ?? ""}\n\`\`\``;
    },
    toHTML: (block) => {
      const lang = String(block.props.language ?? "");
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      return `<pre><code${langAttr}>${block.content ?? ""}</code></pre>`;
    },
  },
});
