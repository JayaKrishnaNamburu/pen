/**
 * DUR7 corpus source of truth.
 *
 * Edit shapes here, then regenerate committed JSON with `node generate.mjs`.
 * Do not hand-edit the JSON files.
 *
 * Snapshots are `exportEditorToJson` documents, not Yjs binaries. That keeps
 * the corpus independent of `loadYjsDocument` and of non-deterministic table
 * cell UUIDs. Store-generation (penFormat) and apps/metadata are not in this
 * interchange format — see README.md and the V.7 as-built notes.
 */

/** @typedef {{ id: string; type: string; props?: Record<string, unknown>; content?: string; children?: TestBlock[] }} TestBlock */

/**
 * @type {readonly {
 *   id: string;
 *   shape: string;
 *   blocks: readonly TestBlock[];
 * }[]}
 */
export const DUR7_CORPUS = [
	{
		id: "DUR7-nested-blocks",
		shape: "nested blocks",
		blocks: [
			{
				id: "DUR7-toggle",
				type: "toggle",
				props: { open: true },
				content: "Nested parent",
			},
			{
				id: "DUR7-nested-child",
				type: "paragraph",
				props: { parentId: "DUR7-toggle" },
				content: "Nested child",
			},
		],
	},
	{
		id: "DUR7-table",
		shape: "table",
		blocks: [
			{
				id: "DUR7-table-block",
				type: "table",
			},
		],
	},
	{
		id: "DUR7-unknown-block-type",
		shape: "unknown block type",
		blocks: [
			{
				id: "DUR7-host-widget",
				type: "hostWidget",
				props: { label: "kept" },
				content: "Unknown type body",
			},
		],
	},
	{
		id: "DUR7-unknown-props",
		shape: "unknown props",
		blocks: [
			{
				id: "DUR7-annotated-paragraph",
				type: "paragraph",
				props: { hostAnnotation: "keep" },
				content: "Known type, unknown prop",
			},
		],
	},
	{
		id: "DUR7-emoji-rtl",
		shape: "emoji + RTL text",
		blocks: [
			{
				id: "DUR7-bidi",
				type: "paragraph",
				content: "שלום 🌍 مرحبا",
			},
		],
	},
];
