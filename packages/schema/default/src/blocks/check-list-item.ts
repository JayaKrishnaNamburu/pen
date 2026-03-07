import { defineBlock, prop } from "@pen/types";

export const checkListItem = defineBlock("checkListItem", {
	props: {
		indent: prop.number().default(0).min(0).describe("Nesting depth"),
		parentId: prop.string().optional().describe("Container parent block"),
		checked: prop
			.boolean()
			.default(false)
			.describe("Whether the item is checked"),
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Check List",
		description: "To-do list item with checkbox",
		group: "lists",
		aliases: ["todo", "checkbox", "task"],
	},
	serialize: {
		toMarkdown: (block) => {
			const indent = "  ".repeat((block.props.indent as number) ?? 0);
			const check = block.props.checked ? "x" : " ";
			return `${indent}- [${check}] ${block.content ?? ""}`;
		},
		toHTML: (block) => {
			const checked = block.props.checked ? " checked" : "";
			return `<li><input type="checkbox"${checked} disabled />${block.content ?? ""}</li>`;
		},
	},
});
