import { defineBlock, prop } from "@pen/types";

export const bulletListItem = defineBlock("bulletListItem", {
	props: {
		indent: prop.number().default(0).min(0).describe("Nesting depth"),
		parentId: prop.string().optional().describe("Container parent block"),
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Bullet List",
		description: "Unordered list item",
		group: "lists",
		aliases: ["ul", "bullet", "unordered"],
	},
	serialize: {
		toMarkdown: (block) => {
			const indent = "  ".repeat((block.props.indent as number) ?? 0);
			return `${indent}- ${block.content ?? ""}`;
		},
		toHTML: (block) => `<li>${block.content ?? ""}</li>`,
	},
});
