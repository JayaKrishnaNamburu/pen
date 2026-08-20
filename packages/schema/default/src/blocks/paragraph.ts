import { defineBlock } from "@input/pen-core";
import { directionProp } from "../directionProp";

export const paragraph = defineBlock("paragraph", {
	props: {
		direction: directionProp,
	},
	content: "inline",
	fieldEditor: "richtext",
	placeholder: "Text",
	display: {
		title: "Paragraph",
		description: "Plain text paragraph",
		group: "basic",
		aliases: ["p", "text"],
	},
	serialize: {
		toMarkdown: (block) => block.content ?? "",
		toHTML: (block) => `<p>${block.content ?? ""}</p>`,
	},
});
