import type {
	EditChannelCorpusPromptId,
	EditChannelCorpusSeed,
} from "./editChannelCorpus";

/**
 * Deterministic doubles for GATE 0.14. They perform the intended edit so the
 * harness is proven; they do not speak to live-model contract adherence.
 */

export const BLOCK_ANNOTATION_PATTERN = /<!-- block:(\S+) (\S+) -->/g;

export const OFF_CONTRACT_OUTPUT =
	"Sure! I've turned the last paragraph into a bullet list for you:\n\n- Revenue grew\n- Costs fell";

export const OFF_CONTRACT_PROMPT =
	"Turn the last paragraph into a bullet list";

export interface BenchAnnotation {
	id: string;
	type: string;
}

export type CorpusPromptId = EditChannelCorpusPromptId;

export interface BenchSkip {
	reason: string;
}

const MATRIX_TABLE = [
	"| Metric | Change |",
	"| --- | --- |",
	"| Revenue | +12% |",
	"| Costs | -8% |",
].join("\n");

const TWO_COLUMN_TABLE = [
	"| Column A | Column B |",
	"| --- | --- |",
	"| Left | Right |",
].join("\n");

export function annotationsFromRequest(request: unknown): BenchAnnotation[] {
	const serialized = JSON.stringify(request);
	return [...serialized.matchAll(BLOCK_ANNOTATION_PATTERN)].map((match) => ({
		id: match[1]!,
		type: match[2]!,
	}));
}

function headingId(
	annotations: BenchAnnotation[],
	seed: EditChannelCorpusSeed,
): string {
	return (
		annotations.find((annotation) => annotation.type === "heading")?.id ??
		seed.headingId
	);
}

function lastParagraphId(
	annotations: BenchAnnotation[],
	seed: EditChannelCorpusSeed,
): string {
	return (
		annotations
			.filter((annotation) => annotation.type === "paragraph")
			.at(-1)?.id ?? seed.closingId
	);
}

function wrapXml(instructions: string, scope: string, edits: string[]): string {
	return [
		"<pen-fast-apply>",
		`<instructions>${instructions}</instructions>`,
		`<scope>${scope}</scope>`,
		...edits,
		"</pen-fast-apply>",
	].join("\n");
}

function replaceTextEdit(blockId: string, text: string): string {
	return [
		"<edit>",
		"<operation>replace_text</operation>",
		`<blockId>${blockId}</blockId>`,
		`<text><![CDATA[${text}]]></text>`,
		"</edit>",
	].join("\n");
}

function appendTextEdit(blockId: string, text: string): string {
	return [
		"<edit>",
		"<operation>append_text</operation>",
		`<blockId>${blockId}</blockId>`,
		`<text><![CDATA[${text}]]></text>`,
		"</edit>",
	].join("\n");
}

function replaceBlocksEdit(blockIds: readonly string[], markdown: string): string {
	return [
		"<edit>",
		"<operation>replace_blocks</operation>",
		...blockIds.map((blockId) => `<block>${blockId}</block>`),
		`<markdown><![CDATA[${markdown}]]></markdown>`,
		"</edit>",
	].join("\n");
}

function insertAfterEdit(blockId: string, markdown: string): string {
	return [
		"<edit>",
		"<operation>insert_after</operation>",
		`<blockId>${blockId}</blockId>`,
		`<markdown><![CDATA[${markdown}]]></markdown>`,
		"</edit>",
	].join("\n");
}

function deleteBlocksEdit(blockIds: readonly string[]): string {
	return [
		"<edit>",
		"<operation>delete_blocks</operation>",
		...blockIds.map((blockId) => `<block>${blockId}</block>`),
		"</edit>",
	].join("\n");
}

export function buildToolOperations(
	id: CorpusPromptId,
	annotations: BenchAnnotation[],
	seed: EditChannelCorpusSeed,
): unknown[] | BenchSkip {
	const heading = headingId(annotations, seed);
	const intro = seed.introId;
	const body1 = seed.bodyIds[0]!;
	const body2 = seed.bodyIds[1]!;
	const body3 = seed.bodyIds[2]!;
	const closing = seed.closingId;
	const lastParagraph = lastParagraphId(annotations, seed);

	switch (id) {
		case "p1":
			return [
				{
					operation: "replace_blocks",
					blockIds: [lastParagraph],
					markdown: "- Revenue grew\n- Costs fell\n- Margins improved\n",
				},
			];
		case "p2":
			return [
				{
					operation: "replace_block_text",
					blockId: heading,
					text: "Our Quarter in Review",
				},
				{
					operation: "replace_block_text",
					blockId: lastParagraph,
					text: "Revenue grew. Costs fell. Margins improved. The matrix below breaks this down.",
				},
				{
					operation: "insert_blocks",
					blockId: lastParagraph,
					placement: "after",
					markdown: `${MATRIX_TABLE}\n`,
				},
			];
		case "p3":
			return [
				{
					operation: "replace_block_text",
					blockId: heading,
					text: "Quarterly Report?",
				},
			];
		case "p4":
			return [
				{
					operation: "delete_blocks",
					blockIds: [intro],
				},
			];
		case "p5":
			return [
				{
					operation: "insert_blocks",
					blockId: intro,
					placement: "after",
					markdown: `${TWO_COLUMN_TABLE}\n`,
				},
			];
		case "p6":
			return [
				{
					operation: "replace_blocks",
					blockIds: [body1, body2, body3],
					markdown: [
						"1. Nimbus shipped three features this quarter.",
						"2. Nimbus reduced support load.",
						"3. Nimbus expanded the trial.",
						"4. Outlook remains steady.",
						"",
					].join("\n"),
				},
			];
		case "p7":
			return [
				{
					operation: "move_block",
					blockId: closing,
					referenceBlockId: body1,
					placement: "before",
				},
			];
		case "p8":
			return [
				{
					operation: "replace_block_text",
					blockId: intro,
					text: "This report covers Q3.",
				},
				{
					operation: "replace_block_text",
					blockId: body1,
					text: "Nimbus shipped three features.",
				},
				{
					operation: "replace_block_text",
					blockId: body2,
					text: "Nimbus reduced load.",
				},
				{
					operation: "replace_block_text",
					blockId: body3,
					text: "Nimbus expanded trial.",
				},
				{
					operation: "replace_block_text",
					blockId: closing,
					text: "Revenue grew.",
				},
			];
		case "p9":
			return [
				{
					operation: "replace_block_text",
					blockId: body1,
					text: "Helios shipped three features this quarter.",
				},
				{
					operation: "replace_block_text",
					blockId: body2,
					text: "Helios reduced support load.",
				},
				{
					operation: "replace_block_text",
					blockId: body3,
					text: "Helios expanded the trial.",
				},
			];
		case "p10":
			return [
				{
					operation: "insert_blocks",
					blockId: closing,
					placement: "before",
					markdown: "## Outlook\n",
				},
				{
					operation: "set_block_props",
					blockId: closing,
					blockType: "blockquote",
				},
			];
		case "p11":
			return [
				{
					operation: "format_text",
					blockId: body1,
					matchText: seed.productName,
					marks: { textColor: { color: "red" } },
				},
			];
		default: {
			const unseen: never = id;
			throw new Error(`unhandled corpus id: ${String(unseen)}`);
		}
	}
}

export function buildXmlPayload(
	id: CorpusPromptId,
	annotations: BenchAnnotation[],
	seed: EditChannelCorpusSeed,
): string | BenchSkip {
	const heading = headingId(annotations, seed);
	const intro = seed.introId;
	const body1 = seed.bodyIds[0]!;
	const body2 = seed.bodyIds[1]!;
	const body3 = seed.bodyIds[2]!;
	const closing = seed.closingId;
	const lastParagraph = lastParagraphId(annotations, seed);

	switch (id) {
		case "p1":
			return wrapXml(
				"I am converting the last paragraph into a bullet list.",
				"single-block",
				[
					replaceBlocksEdit(
						[lastParagraph],
						"- Revenue grew\n- Costs fell\n- Margins improved\n",
					),
				],
			);
		case "p2":
			return wrapXml(
				"I am softening the title, extending the closing paragraph, and adding the matrix table.",
				"section",
				[
					replaceTextEdit(heading, "Our Quarter in Review"),
					appendTextEdit(
						lastParagraph,
						" The matrix below breaks this down.",
					),
					insertAfterEdit(lastParagraph, `${MATRIX_TABLE}\n`),
				],
			);
		case "p3":
			return wrapXml("I am making the heading a question.", "single-block", [
				replaceTextEdit(heading, "Quarterly Report?"),
			]);
		case "p4":
			return wrapXml("I am deleting the intro paragraph.", "single-block", [
				deleteBlocksEdit([intro]),
			]);
		case "p5":
			return wrapXml(
				"I am inserting a two-column table after the intro.",
				"adjacent-blocks",
				[insertAfterEdit(intro, `${TWO_COLUMN_TABLE}\n`)],
			);
		case "p6":
			return wrapXml(
				"I am converting the body into a numbered list and adding a fourth item.",
				"section",
				[
					replaceBlocksEdit(
						[body1, body2, body3],
						[
							"1. Nimbus shipped three features this quarter.",
							"2. Nimbus reduced support load.",
							"3. Nimbus expanded the trial.",
							"4. Outlook remains steady.",
							"",
						].join("\n"),
					),
				],
			);
		case "p7":
			return {
				reason:
					"XML flow-patch has no move operation; an identity-preserving reorder cannot be expressed without fabricating ids",
			};
		case "p8":
			return wrapXml("I am shortening every paragraph.", "section", [
				replaceTextEdit(intro, "This report covers Q3."),
				replaceTextEdit(body1, "Nimbus shipped three features."),
				replaceTextEdit(body2, "Nimbus reduced load."),
				replaceTextEdit(body3, "Nimbus expanded trial."),
				replaceTextEdit(closing, "Revenue grew."),
			]);
		case "p9":
			return wrapXml(
				"I am renaming every occurrence of the product name.",
				"section",
				[
					replaceTextEdit(
						body1,
						"Helios shipped three features this quarter.",
					),
					replaceTextEdit(body2, "Helios reduced support load."),
					replaceTextEdit(body3, "Helios expanded the trial."),
				],
			);
		case "p10":
			return {
				reason:
					"XML flow-patch has no identity-preserving type change; replace_blocks reassigns the closing id",
			};
		case "p11":
			return {
				reason:
					"XML flow-patch cannot express marks; markdown serialization drops textColor",
			};
		default: {
			const unseen: never = id;
			throw new Error(`unhandled corpus id: ${String(unseen)}`);
		}
	}
}

export function isBenchSkip(value: unknown): value is BenchSkip {
	return (
		typeof value === "object" &&
		value !== null &&
		"reason" in value &&
		typeof (value as BenchSkip).reason === "string" &&
		!("length" in value)
	);
}
