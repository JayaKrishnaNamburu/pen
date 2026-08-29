import type {
	AppSchema,
	BlockDisplay,
	BlockSchema,
	ContentType,
	InlineSchema,
	LayoutSchema,
	PropSchema,
	SchemaRegistry,
} from "@input/pen-types";

function block(
	type: string,
	config: {
		propSchema?: Record<string, PropSchema>;
		content?: ContentType;
		fieldEditor?: BlockSchema["fieldEditor"];
		authoring?: BlockSchema["authoring"];
		display?: BlockSchema["display"];
		serialize?: BlockSchema["serialize"];
	} = {},
): BlockSchema<string, Record<string, PropSchema>, ContentType> {
	return {
		type,
		propSchema: config.propSchema ?? {},
		content: config.content ?? "inline",
		fieldEditor: config.fieldEditor,
		serialize: config.serialize ?? {},
		authoring: config.authoring,
		display: config.display,
	};
}

const paragraph = block("paragraph", {
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Paragraph",
		group: "basic",
	},
	serialize: {
		toMarkdown: (current) => current.content ?? "",
	},
});

const heading = block("heading", {
	propSchema: {
		level: {
			type: "number",
			default: 1,
			enum: [1, 2, 3, 4, 5, 6],
			description: "Heading level",
		},
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Heading",
		group: "basic",
	},
	serialize: {
		toMarkdown: (current) =>
			`${"#".repeat((current.props.level as number) ?? 1)} ${current.content ?? ""}`,
	},
});

const bulletListItem = block("bulletListItem", {
	propSchema: {
		indent: { type: "number", default: 0, minimum: 0 },
		parentId: { type: "string" },
	},
	content: "inline",
	fieldEditor: "richtext",
	display: {
		title: "Bullet List",
		group: "lists",
	},
	serialize: {
		toMarkdown: (current) => {
			const indent = "  ".repeat((current.props.indent as number) ?? 0);
			return `${indent}- ${current.content ?? ""}`;
		},
	},
});

const table = block("table", {
	propSchema: {
		hasHeaderRow: {
			type: "boolean",
			default: true,
			description: "First row is a header",
		},
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

const image = block("image", {
	propSchema: {
		src: { type: "string", default: "" },
		alt: { type: "string" },
		caption: { type: "string" },
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
});

const subdocument = block("subdocument", {
	propSchema: {
		title: { type: "string", default: "Subdocument" },
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

const testBlocks = [
	paragraph,
	heading,
	bulletListItem,
	table,
	image,
	subdocument,
];

export function createDefaultSchema(): SchemaRegistry {
	const blocks = new Map(testBlocks.map((schema) => [schema.type, schema]));
	const displayed = testBlocks.filter(
		(schema): schema is BlockSchema & { display: BlockDisplay } =>
			schema.display != null,
	);

	return {
		resolve(type: string): BlockSchema | null {
			return blocks.get(type) ?? null;
		},
		resolveInline(): InlineSchema | null {
			return null;
		},
		resolveApp(): AppSchema | null {
			return null;
		},
		resolveLayout(): LayoutSchema | null {
			return null;
		},
		allBlocks(): readonly BlockSchema[] {
			return testBlocks;
		},
		allInlines(): readonly InlineSchema[] {
			return [];
		},
		allApps(): readonly AppSchema[] {
			return [];
		},
		allBlockDisplays(): readonly (BlockSchema & { display: BlockDisplay })[] {
			return displayed;
		},
		onUnknownBlock: () => "passthrough",
	};
}
