import { defineBlock, prop } from "@pen/types";
import type { HTMLImportElement } from "@pen/types";

const CALLOUT_TYPE_PATTERN =
  /\bcallout[- ]?(info|warning|error)\b/i;

const MARKDOWN_CALLOUT_TYPE_MAP: Record<string, string> = {
  note: "info",
  warning: "warning",
  error: "error",
};

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
    fromMarkdown: (node) => {
      if (node.type !== "blockquote" || !node.children?.length) return null;
      const first = node.children[0];
      if (first.type !== "paragraph" || !first.children?.length) return null;

      const textChild = first.children[0];
      if (textChild.type !== "strong" || !textChild.children?.length)
        return null;

      const label = textChild.children[0]?.value ?? "";
      const cleanLabel = label.replace(/:$/, "").toLowerCase();
      const calloutType = MARKDOWN_CALLOUT_TYPE_MAP[cleanLabel];
      if (!calloutType) return null;

      return {
        type: "callout",
        props: { type: calloutType },
        importContentSource: {
          markdownNodes: trimLeadingWhitespaceNodes(first.children.slice(1)),
        },
      };
    },
    toHTML: (block) => {
      const type = block.props.type ?? "info";
      return `<div class="callout callout-${type}">${block.content ?? ""}</div>`;
    },
    fromHTML: (el: HTMLImportElement) => {
      if (el.tagName !== "div") return null;
      const cls = el.getAttribute("class") ?? "";
      const match = CALLOUT_TYPE_PATTERN.exec(cls);
      if (!match) return null;
      const calloutType = (match[1] ?? "info").toLowerCase();
      return {
        type: "callout",
        props: {
          type: ["info", "warning", "error"].includes(calloutType)
            ? calloutType
            : "info",
        },
      };
    },
  },
});

function trimLeadingWhitespaceNodes<
  T extends { type?: string; value?: string },
>(nodes: T[]): T[] {
  const trimmed = nodes.slice();
  while (trimmed.length > 0) {
    const first = trimmed[0];
    if (first?.type !== "text" || typeof first.value !== "string") {
      break;
    }

    const nextValue = first.value.replace(/^\s+/, "");
    if (nextValue.length === 0) {
      trimmed.shift();
      continue;
    }

    if (nextValue === first.value) {
      break;
    }

    trimmed[0] = { ...first, value: nextValue };
    break;
  }
  return trimmed;
}
