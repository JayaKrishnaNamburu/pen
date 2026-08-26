import type { Editor } from "@input/pen-types";

/**
 * Reference corpus. Fixed before the channel is measured
 * (`spec/packages/extensions/ai.md`, the EC rules).
 */

export const EDIT_CHANNEL_CORPUS_HEADING_TEXT = "Quarterly Report";
export const EDIT_CHANNEL_CORPUS_INTRO_TEXT =
	"This report covers the third quarter.";
export const EDIT_CHANNEL_CORPUS_CLOSING_TEXT =
	"Revenue grew. Costs fell. Margins improved.";
/** Distinctive token used by prompt 9 (cross-block rename). */
export const EDIT_CHANNEL_CORPUS_PRODUCT_NAME = "Nimbus";

const BODY_TEXTS = [
	"Nimbus shipped three features this quarter.",
	"Nimbus reduced support load.",
	"Nimbus expanded the trial.",
] as const;

export interface EditChannelCorpusSeed {
	headingId: string;
	introId: string;
	bodyIds: readonly string[];
	closingId: string;
	headingText: string;
	introText: string;
	bodyTexts: readonly string[];
	closingText: string;
	productName: string;
	blockIds: readonly string[];
	textById: Readonly<Record<string, string>>;
	typeById: Readonly<Record<string, string>>;
	blockCount: number;
}

/**
 * The corpus is fixed before the channel exists (WA10), so the id set is
 * closed: the doubles' exhaustive switches narrow on it, and a twelfth
 * prompt is a type-level event that forces every double to handle it.
 */
export type EditChannelCorpusPromptId =
	| "p1"
	| "p2"
	| "p3"
	| "p4"
	| "p5"
	| "p6"
	| "p7"
	| "p8"
	| "p9"
	| "p10"
	| "p11";

export interface EditChannelCorpusPrompt {
	id: EditChannelCorpusPromptId;
	prompt: string;
	/** Returns null when the postcondition is met, else why it failed. */
	postcondition: (
		editor: Editor,
		seed: EditChannelCorpusSeed,
	) => string | null;
	/** Prompt 9 is expected to be the weak one; see Do-Not-Miss. */
	knownWeak?: boolean;
}

export interface EditChannelCorpusMetrics {
	postconditionMet: boolean;
	modelPasses: number;
	toolCalls: number;
	refusals: number;
	outputChars: number;
	/** The document was left in a state the postcondition did not ask for. */
	wrongEdit: boolean;
}

function listBlocks(editor: Editor) {
	return Array.from(editor.blocks());
}

function snapshot(editor: Editor): EditChannelCorpusSeed["textById"] {
	return Object.fromEntries(
		listBlocks(editor).map((block) => [block.id, block.textContent()]),
	);
}

function typeSnapshot(editor: Editor): EditChannelCorpusSeed["typeById"] {
	return Object.fromEntries(
		listBlocks(editor).map((block) => [block.id, block.type]),
	);
}

function countNeedle(haystack: string, needle: string): number {
	let count = 0;
	let from = 0;
	while (from <= haystack.length) {
		const index = haystack.indexOf(needle, from);
		if (index === -1) {
			break;
		}
		count += 1;
		from = index + needle.length;
	}
	return count;
}

function documentNeedleCount(editor: Editor, needle: string): number {
	return listBlocks(editor).reduce(
		(sum, block) => sum + countNeedle(block.textContent(), needle),
		0,
	);
}

export function seedEditChannelCorpus(editor: Editor): EditChannelCorpusSeed {
	const headingId = editor.firstBlock()!.id;
	const introId = "intro";
	const bodyIds = ["body-1", "body-2", "body-3"] as const;
	const closingId = "closing";

	editor.apply(
		[
			{
				type: "set-props",
				blockId: headingId,
				props: { type: "heading", level: 1 },
			},
			{
				type: "splice-text",
				blockId: headingId,
				from: 0,
				to: 0,
				insert: EDIT_CHANNEL_CORPUS_HEADING_TEXT,
			},
			{
				type: "insert-block",
				blockId: introId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: introId,
				from: 0,
				to: 0,
				insert: EDIT_CHANNEL_CORPUS_INTRO_TEXT,
			},
			...bodyIds.flatMap((blockId, index) => [
				{
					type: "insert-block" as const,
					blockId,
					blockType: "paragraph",
					props: {},
					position: "last" as const,
				},
				{
					type: "splice-text" as const,
					blockId,
					from: 0,
					to: 0,
					insert: BODY_TEXTS[index]!,
				},
			]),
			{
				type: "insert-block",
				blockId: closingId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: closingId,
				from: 0,
				to: 0,
				insert: EDIT_CHANNEL_CORPUS_CLOSING_TEXT,
			},
		],
		{ origin: "system" },
	);

	const blocks = listBlocks(editor);
	return {
		headingId,
		introId,
		bodyIds,
		closingId,
		headingText: EDIT_CHANNEL_CORPUS_HEADING_TEXT,
		introText: EDIT_CHANNEL_CORPUS_INTRO_TEXT,
		bodyTexts: BODY_TEXTS,
		closingText: EDIT_CHANNEL_CORPUS_CLOSING_TEXT,
		productName: EDIT_CHANNEL_CORPUS_PRODUCT_NAME,
		blockIds: blocks.map((block) => block.id),
		textById: snapshot(editor),
		typeById: typeSnapshot(editor),
		blockCount: blocks.length,
	};
}

function postconditionP1(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	const heading = editor.getBlock(seed.headingId);
	if (!heading) {
		return "heading is missing";
	}
	if (heading.textContent() !== seed.headingText) {
		return "heading text changed";
	}
	const bullets = listBlocks(editor).filter(
		(block) => block.type === "bulletListItem",
	);
	if (bullets.length !== 3) {
		return `expected 3 bulletListItem blocks, found ${bullets.length}`;
	}
	return null;
}

function postconditionP2(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	const heading = editor.getBlock(seed.headingId);
	if (!heading) {
		return "heading is missing";
	}
	if (heading.textContent() === seed.headingText) {
		return "heading text unchanged";
	}
	const closing = editor.getBlock(seed.closingId);
	if (!closing) {
		return "closing paragraph missing";
	}
	const closingText = closing.textContent();
	if (!closingText.startsWith(seed.closingText)) {
		return "closing paragraph lost its original prefix";
	}
	if (closingText.length <= seed.closingText.length) {
		return "closing paragraph did not grow";
	}
	const tables = listBlocks(editor).filter((block) => block.type === "table");
	if (tables.length < 1) {
		return "no table block";
	}
	return null;
}

function postconditionP3(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	const heading = editor.getBlock(seed.headingId);
	if (!heading) {
		return "heading is missing";
	}
	if (!heading.textContent().endsWith("?")) {
		return "heading does not end with ?";
	}
	if (editor.blockCount() !== seed.blockCount) {
		return "block count changed";
	}
	return null;
}

function postconditionP4(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	if (editor.getBlock(seed.introId)) {
		return "intro id still present";
	}
	if (editor.blockCount() !== seed.blockCount - 1) {
		return `block count is not seed-1 (found ${editor.blockCount()})`;
	}
	return null;
}

function postconditionP5(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	const tables = listBlocks(editor).filter((block) => block.type === "table");
	if (tables.length !== 1) {
		return `expected 1 table block, found ${tables.length}`;
	}
	if (tables[0]!.prev?.id !== seed.introId) {
		return "table is not after the intro";
	}
	return null;
}

function postconditionP6(editor: Editor): string | null {
	const numbered = listBlocks(editor).filter(
		(block) => block.type === "numberedListItem",
	);
	if (numbered.length !== 4) {
		return `expected 4 numberedListItem blocks, found ${numbered.length}`;
	}
	return null;
}

function postconditionP7(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	const blocks = listBlocks(editor);
	const ids = blocks.map((block) => block.id);
	const seedIdSet = new Set(seed.blockIds);
	if (
		ids.length !== seed.blockIds.length ||
		ids.some((id) => !seedIdSet.has(id))
	) {
		return "block ids were not preserved";
	}
	for (const block of blocks) {
		if (block.textContent() !== seed.textById[block.id]) {
			return "text changed";
		}
	}
	const closingIndex = ids.indexOf(seed.closingId);
	const bodyIndexes = seed.bodyIds.map((id) => ids.indexOf(id));
	if (
		closingIndex === -1 ||
		bodyIndexes.some((index) => index === -1) ||
		closingIndex >= Math.min(...bodyIndexes)
	) {
		return "closing is not above the body";
	}
	if (ids.join("\0") === seed.blockIds.join("\0")) {
		return "block order did not change";
	}
	return null;
}

function postconditionP8(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	if (editor.blockCount() !== seed.blockCount) {
		return "block count changed";
	}
	for (const id of seed.blockIds) {
		const block = editor.getBlock(id);
		if (!block) {
			return `seed block ${id} is missing`;
		}
		const seedType = seed.typeById[id]!;
		const seedText = seed.textById[id]!;
		if (seedType === "paragraph") {
			if (block.type !== "paragraph") {
				return `paragraph ${id} is no longer a paragraph`;
			}
			if (block.textContent().length >= seedText.length) {
				return `paragraph ${id} was not shortened`;
			}
			continue;
		}
		if (block.type !== seedType || block.textContent() !== seedText) {
			return `non-paragraph ${id} was touched`;
		}
	}
	return null;
}

function postconditionP9(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	if (editor.blockCount() !== seed.blockCount) {
		return "block count changed";
	}
	if (documentNeedleCount(editor, seed.productName) > 0) {
		return "product name still occurs";
	}
	for (const id of seed.blockIds) {
		const block = editor.getBlock(id);
		if (!block) {
			return `seed block ${id} is missing`;
		}
		const seedText = seed.textById[id]!;
		const hadName = seedText.includes(seed.productName);
		if (hadName) {
			if (block.textContent() === seedText) {
				return `product-name block ${id} is unchanged`;
			}
			continue;
		}
		if (
			block.textContent() !== seedText ||
			block.type !== seed.typeById[id]
		) {
			return `unrelated block ${id} changed`;
		}
	}
	return null;
}

function postconditionP10(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	const closing = editor.getBlock(seed.closingId);
	if (!closing) {
		return "closing is missing";
	}
	if (closing.textContent() !== seed.closingText) {
		return "closing text changed";
	}
	if (closing.type !== "blockquote") {
		return "closing is not a blockquote";
	}
	const headings = listBlocks(editor).filter(
		(block) => block.type === "heading",
	);
	if (headings.length !== 2) {
		return `expected one new heading (2 total), found ${headings.length}`;
	}
	if (
		closing.prev?.type !== "heading" ||
		closing.prev.id === seed.headingId
	) {
		return "new heading is not before the closing paragraph";
	}
	return null;
}

function hasColoredSpan(
	block: NonNullable<ReturnType<Editor["getBlock"]>>,
	needle: string,
	mark: string,
	props: Record<string, unknown>,
): boolean {
	return block.textDeltas().some((delta) => {
		if (!delta.insert.includes(needle)) {
			return false;
		}
		const attributes = delta.attributes?.[mark];
		if (
			typeof attributes !== "object" ||
			attributes === null ||
			Array.isArray(attributes)
		) {
			return false;
		}
		const record = attributes as Record<string, unknown>;
		return Object.entries(props).every(
			([key, value]) => record[key] === value,
		);
	});
}

function postconditionP11(
	editor: Editor,
	seed: EditChannelCorpusSeed,
): string | null {
	const body = editor.getBlock(seed.bodyIds[0]!);
	if (!body) {
		return "first body paragraph is missing";
	}
	if (body.id !== seed.bodyIds[0]) {
		return "first body paragraph id changed";
	}
	if (body.textContent() !== seed.bodyTexts[0]) {
		return "first body paragraph text changed";
	}
	if (
		!hasColoredSpan(body, seed.productName, "textColor", { color: "red" })
	) {
		return "product name is not marked textColor red on the first body paragraph";
	}
	return null;
}

export const EDIT_CHANNEL_CORPUS: readonly EditChannelCorpusPrompt[] = [
	{
		id: "p1",
		prompt: "Turn the last paragraph into a bullet list",
		postcondition: postconditionP1,
	},
	{
		id: "p2",
		prompt: "Edit the title and make it friendlier, then extend the last paragraph with some more text and a table showing the matrix.",
		postcondition: postconditionP2,
	},
	{
		id: "p3",
		prompt: "Make the heading a question.",
		postcondition: postconditionP3,
	},
	{
		id: "p4",
		prompt: "Delete the intro paragraph.",
		postcondition: postconditionP4,
	},
	{
		id: "p5",
		prompt: "Add a two-column table after the intro.",
		postcondition: postconditionP5,
	},
	{
		id: "p6",
		prompt: "Convert the body into a numbered list and add a fourth item.",
		postcondition: postconditionP6,
	},
	{
		id: "p7",
		prompt: "Move the closing paragraph above the body.",
		postcondition: postconditionP7,
	},
	{
		id: "p8",
		prompt: "Shorten every paragraph.",
		postcondition: postconditionP8,
	},
	{
		id: "p9",
		prompt: "Rename every occurrence of the product name.",
		postcondition: postconditionP9,
		knownWeak: true,
	},
	{
		id: "p10",
		prompt: "Add a heading before the closing paragraph and make the closing paragraph a quote.",
		postcondition: postconditionP10,
	},
	{
		id: "p11",
		prompt: "Color every occurrence of the product name red in the first body paragraph.",
		postcondition: postconditionP11,
	},
];
