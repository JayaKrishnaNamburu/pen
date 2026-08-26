import type { HTMLImportElement } from "@input/pen-types";
import {
	defineBlock,
	prop,
} from "@input/pen-core";
import { directionProp } from "../directionProp";

const CALLOUT_TYPE_PATTERN =
  /\bcallout[- ]?(info|warning|error)\b/i;

const MARKDOWN_CALLOUT_TYPE_MAP: Record<string, string> = {
  note: "info",
  warning: "warning",
  error: "error",
};

export const callout = defineBlock("callout", {
  props: {
    severity: prop
      .enum(["info", "warning", "error"])
      .default("info")
      .describe("Callout severity"),
    parentId: prop.string().optional().describe("Container parent block"),
    direction: directionProp,
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
        block.props.severity === "warning"
          ? "> **Warning:**"
          : block.props.severity === "error"
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
        props: { severity: calloutType },
        importContentSource: {
          markdownNodes: trimLeadingWhitespaceNodes(first.children.slice(1)),
        },
        children: (node.children ?? []).slice(1).map((child) => ({
          type: child.type,
          props: {},
          importContentSource: { markdownNodes: [child] },
        })),
      };
    },
    toHTML: (block) => {
      const raw = block.props.severity;
      const severity =
        raw === "warning" || raw === "error" || raw === "info" ? raw : "info";
      // SEC5: clamped callout class token
      return `<div class="callout callout-${severity}">${block.content ?? ""}</div>`;
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
          severity: ["info", "warning", "error"].includes(calloutType)
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
