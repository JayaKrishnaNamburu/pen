import { defineBlock, prop } from "@input/pen-types";
import { escapeHtml } from "../escapeHtml";

export const image = defineBlock("image", {
  props: {
    src: prop.string().default("").describe("Image URL or asset reference"),
    alt: prop.string().optional().describe("Alt text for accessibility"),
    caption: prop.string().optional().describe("Image caption"),
    width: prop.number().optional().describe("Display width in pixels"),
  },
  content: "none",
  fieldEditor: "none",
  authoring: {
    flowCapability: "flow-structural",
    selectionRole: "structural",
  },
  display: {
    title: "Image",
    description: "Embedded image",
    group: "media",
    aliases: ["img", "picture", "photo"],
  },
  serialize: {
    toMarkdown: (block) => {
      const alt = block.props.alt ?? "";
      return `![${alt}](${block.props.src})`;
    },
    toHTML: (block) => {
      const alt = block.props.alt
        ? ` alt="${escapeHtml(String(block.props.alt))}"`
        : "";
      const width = block.props.width
        ? ` width="${escapeHtml(String(block.props.width))}"`
        : "";
      return `<img src="${escapeHtml(String(block.props.src ?? ""))}"${alt}${width} />`;
    },
  },
});
