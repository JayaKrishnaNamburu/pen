import { defineBlock, prop } from "@pen/types";

export const numberedListItem = defineBlock("numberedListItem", {
	props: {
		indent: prop.number().default(0).min(0).describe("Nesting depth"),
		parentId: prop.string().optional().describe("Container parent block"),
		start: prop
			.number()
			.optional()
			.describe("Restart numbering from this value"),
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Numbered List",
		description: "Ordered list item",
		group: "lists",
		aliases: ["ol", "numbered", "ordered"],
	},
	serialize: {
		toMarkdown: (block) => {
			const indent = "  ".repeat((block.props.indent as number) ?? 0);
			const start = (block.props.start as number) ?? 1;
			return `${indent}${start}. ${block.content ?? ""}`;
		},
		toHTML: (block) => `<li>${block.content ?? ""}</li>`,
	},
});
