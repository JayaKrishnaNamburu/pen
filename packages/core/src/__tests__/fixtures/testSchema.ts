import type {
	BlockSchema,
	ComposableSchema,
	InlineSchema,
	PropSchema,
} from "@input/pen-types";

import { defineBlock } from "../../schema/defineBlock";
import { prop, resolveSchema } from "../../schema/prop";
import { SchemaRegistryImpl } from "../../schema/registry";

function resolveProps(
	props: Record<string, unknown>,
): Record<string, PropSchema> {
	const resolved: Record<string, PropSchema> = {};
	for (const [key, value] of Object.entries(props)) {
		resolved[key] = resolveSchema(value);
	}
	return resolved;
}

const paragraph = defineBlock("paragraph", {
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Paragraph",
		group: "basic",
	},
});

const heading = defineBlock("heading", {
	props: {
		level: prop.enum([1, 2, 3, 4, 5, 6]).default(1).describe("Heading level"),
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Heading",
		group: "basic",
	},
});

const table = defineBlock("table", {
	props: {
		hasHeaderRow: prop
			.boolean()
			.default(true)
			.describe("First row is a header"),
	},
	content: "table",
	fieldEditor: "table",
	authoring: {
		flowCapability: "flow-delegated",
		selectionRole: "delegated",
	},
	display: {
		title: "Table",
		group: "advanced",
	},
});

const divider = defineBlock("divider", {
	content: "none",
	fieldEditor: "none",
	authoring: {
		flowCapability: "flow-structural",
		selectionRole: "structural",
	},
	display: {
		title: "Divider",
		group: "basic",
	},
});

const toggle = defineBlock("toggle", {
	props: {
		open: prop.boolean().default(false),
		parentId: prop.string().optional(),
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Toggle",
		group: "basic",
	},
});

const subdocument = defineBlock("subdocument", {
	props: {
		title: prop.string().default("Subdocument"),
		subdocumentGuid: prop.string().optional(),
	},
	content: "subdocument",
	fieldEditor: "none",
	authoring: {
		flowCapability: "flow-delegated",
		selectionRole: "delegated",
	},
	display: {
		title: "Subdocument",
		hidden: true,
	},
});

const codeBlock = defineBlock("codeBlock", {
	props: {
		language: prop.string().optional(),
	},
	content: "inline",
	fieldEditor: "code",
	authoring: {
		selectionRole: "delegated",
	},
	display: {
		title: "Code Block",
		group: "basic",
	},
});

const bulletListItem = defineBlock("bulletListItem", {
	props: {
		indent: prop.number().default(0).min(0),
		parentId: prop.string().optional(),
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Bullet List",
		group: "lists",
	},
});

const image = defineBlock("image", {
	props: {
		src: prop.string().default(""),
		alt: prop.string().optional(),
		caption: prop.string().optional(),
	},
	content: "none",
	fieldEditor: "none",
	authoring: {
		flowCapability: "flow-structural",
		selectionRole: "structural",
	},
	display: {
		title: "Image",
		group: "media",
	},
}).a11y({
	label: (props) => {
		const alt = typeof props.alt === "string" ? props.alt.trim() : "";
		if (alt.length > 0) {
			return alt;
		}
		const caption =
			typeof props.caption === "string" ? props.caption.trim() : "";
		if (caption.length > 0) {
			return caption;
		}
		return "Image";
	},
	roleDescription: "image",
});

const bold: InlineSchema = {
	type: "bold",
	propSchema: {},
	kind: "mark",
	expand: "after",
	priority: 100,
	serialize: {},
};

const mention: InlineSchema = {
	type: "mention",
	propSchema: resolveProps({
		id: prop.string().default("").describe("Referenced entity ID"),
		label: prop.string().default("").describe("Display name"),
	}),
	kind: "node",
	serialize: {},
	a11y: {
		label: (props) => {
			const name =
				typeof props.label === "string" ? props.label.trim() : "";
			return name.length > 0 ? `@${name}` : "Mention";
		},
		roleDescription: "mention",
	},
};

const testBlocks = [
	paragraph,
	heading,
	table,
	divider,
	toggle,
	subdocument,
	codeBlock,
	bulletListItem,
	image,
] as BlockSchema[];

const testInlines = [bold, mention] as InlineSchema[];

export function createDefaultSchema(): ComposableSchema {
	return new SchemaRegistryImpl({
		blocks: testBlocks,
		inlines: testInlines,
		onUnknownBlock: () => "passthrough",
	});
}

export const defaultSchema = createDefaultSchema();
