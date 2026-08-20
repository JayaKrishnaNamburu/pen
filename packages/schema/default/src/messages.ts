/**
 * Default-schema display catalog (LOC2).
 *
 * Maps stable `pen.schema.*` / `pen.display.group.*` keys to the English
 * literals already shipped on default blocks and inlines. Display fields stay
 * those literals; hosts translate by overriding this catalog. A value that is
 * not a key is returned unchanged (custom schemas keep owning their copy).
 */

export const SCHEMA_DISPLAY_CATALOG = {
	"pen.schema.paragraph.title": "Paragraph",
	"pen.schema.paragraph.description": "Plain text paragraph",
	"pen.schema.paragraph.placeholder": "Text",
	"pen.schema.heading.title": "Heading",
	"pen.schema.heading.description": "Large section heading",
	"pen.schema.heading.placeholder": "Heading",
	"pen.schema.bulletListItem.title": "Bullet List",
	"pen.schema.bulletListItem.description": "Unordered list item",
	"pen.schema.bulletListItem.placeholder": "List",
	"pen.schema.numberedListItem.title": "Numbered List",
	"pen.schema.numberedListItem.description": "Ordered list item",
	"pen.schema.numberedListItem.placeholder": "List",
	"pen.schema.checkListItem.title": "Check List",
	"pen.schema.checkListItem.description": "To-do list item with checkbox",
	"pen.schema.checkListItem.placeholder": "To-do",
	"pen.schema.codeBlock.title": "Code Block",
	"pen.schema.codeBlock.description": "Code with syntax highlighting",
	"pen.schema.image.title": "Image",
	"pen.schema.image.description": "Embedded image",
	"pen.schema.table.title": "Table",
	"pen.schema.table.description": "Data table with rows and columns",
	"pen.schema.divider.title": "Divider",
	"pen.schema.divider.description": "Visual separator",
	"pen.schema.callout.title": "Callout",
	"pen.schema.callout.description": "Highlighted callout box",
	"pen.schema.toggle.title": "Toggle",
	"pen.schema.toggle.description": "Collapsible content block",
	"pen.schema.blockquote.title": "Quote",
	"pen.schema.blockquote.description": "Block quotation",
	"pen.schema.subdocument.title": "Subdocument",
	"pen.schema.subdocument.description":
		"Nested Pen editor backed by a Yjs subdocument",

	"pen.schema.bold.title": "Bold",
	"pen.schema.bold.description": "Bold text formatting",
	"pen.schema.italic.title": "Italic",
	"pen.schema.italic.description": "Italic text formatting",
	"pen.schema.underline.title": "Underline",
	"pen.schema.underline.description": "Underlined text",
	"pen.schema.strikethrough.title": "Strikethrough",
	"pen.schema.strikethrough.description": "Strikethrough text",
	"pen.schema.highlight.title": "Highlight",
	"pen.schema.highlight.description": "Highlighted text with configurable color",
	"pen.schema.textColor.title": "Text Color",
	"pen.schema.textColor.description": "Colored text",
	"pen.schema.backgroundColor.title": "Background Color",
	"pen.schema.backgroundColor.description": "Text with background color",
	"pen.schema.code.title": "Code",
	"pen.schema.code.description": "Inline code span",
	"pen.schema.link.title": "Link",
	"pen.schema.link.description": "Hyperlink with URL and optional title",
	"pen.schema.mention.title": "Mention",
	"pen.schema.mention.description": "Mention of a user, page, or entity",
	"pen.schema.inlineApp.title": "Inline App",
	"pen.schema.inlineApp.description": "Inline embedded application",

	"pen.display.group.basic": "Basic",
	"pen.display.group.lists": "Lists",
	"pen.display.group.media": "Media",
	"pen.display.group.advanced": "Advanced",

	"pen.schema.document.emptyPlaceholder": "Start writing...",
} as const;

export type SchemaDisplayMessageKey = keyof typeof SCHEMA_DISPLAY_CATALOG;

export type SchemaDisplayField = "title" | "description" | "placeholder";

export function schemaDisplayKey(
	type: string,
	field: SchemaDisplayField,
): `pen.schema.${string}.${SchemaDisplayField}` {
	return `pen.schema.${type}.${field}`;
}

export function schemaGroupKey(group: string): `pen.display.group.${string}` {
	return `pen.display.group.${group}`;
}

export function resolveDisplayCopy(
	value: string | undefined,
	catalog: Record<string, string> = SCHEMA_DISPLAY_CATALOG,
): string | undefined {
	if (value == null) {
		return undefined;
	}
	return catalog[value] ?? value;
}

export function resolveDisplayGroup(
	group: string | undefined,
	catalog: Record<string, string> = SCHEMA_DISPLAY_CATALOG,
): string | undefined {
	if (group == null) {
		return undefined;
	}
	if (group in catalog) {
		return catalog[group];
	}
	const mapped = catalog[schemaGroupKey(group)];
	return mapped ?? group;
}
