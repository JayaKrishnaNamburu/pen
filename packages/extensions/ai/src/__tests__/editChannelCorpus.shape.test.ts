import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { Editor } from "@input/pen-types";
import {
	EDIT_CHANNEL_CORPUS,
	type EditChannelCorpusPrompt,
	type EditChannelCorpusSeed,
	seedEditChannelCorpus,
} from "./fixtures/editChannelCorpus";

function createSeededEditor(): {
	editor: Editor;
	seed: EditChannelCorpusSeed;
} {
	const editor = createEditor({ schema: defaultSchema });
	const seed = seedEditChannelCorpus(editor);
	return { editor, seed };
}

function applyCorrectEdit(
	id: EditChannelCorpusPrompt["id"],
	editor: Editor,
	seed: EditChannelCorpusSeed,
): void {
	switch (id) {
		case "p1": {
			editor.apply(
				[
					{
						type: "set-props",
						blockId: seed.closingId,
						props: { type: "bulletListItem" },
					},
					{
						type: "splice-text",
						blockId: seed.closingId,
						from: 0,
						to: seed.closingText.length,
						insert: "Revenue grew",
					},
					{
						type: "insert-block",
						blockId: "p1-item-2",
						blockType: "bulletListItem",
						props: {},
						position: { after: seed.closingId },
					},
					{
						type: "splice-text",
						blockId: "p1-item-2",
						from: 0,
						to: 0,
						insert: "Costs fell",
					},
					{
						type: "insert-block",
						blockId: "p1-item-3",
						blockType: "bulletListItem",
						props: {},
						position: { after: "p1-item-2" },
					},
					{
						type: "splice-text",
						blockId: "p1-item-3",
						from: 0,
						to: 0,
						insert: "Margins improved",
					},
				],
				{ origin: "user" },
			);
			return;
		}
		case "p2": {
			editor.apply(
				[
					{
						type: "splice-text",
						blockId: seed.headingId,
						from: 0,
						to: seed.headingText.length,
						insert: "Our Quarter in Review",
					},
					{
						type: "splice-text",
						blockId: seed.closingId,
						from: seed.closingText.length,
						to: seed.closingText.length,
						insert: " The matrix below breaks this down.",
					},
					{
						type: "insert-block",
						blockId: "p2-table",
						blockType: "table",
						props: {},
						position: { after: seed.closingId },
					},
				],
				{ origin: "user" },
			);
			return;
		}
		case "p3": {
			editor.apply(
				[
					{
						type: "splice-text",
						blockId: seed.headingId,
						from: seed.headingText.length,
						to: seed.headingText.length,
						insert: "?",
					},
				],
				{ origin: "user" },
			);
			return;
		}
		case "p4": {
			editor.apply([{ type: "delete-block", blockId: seed.introId }], {
				origin: "user",
			});
			return;
		}
		case "p5": {
			editor.apply(
				[
					{
						type: "insert-block",
						blockId: "p5-table",
						blockType: "table",
						props: {},
						position: { after: seed.introId },
					},
				],
				{ origin: "user" },
			);
			return;
		}
		case "p6": {
			const lastBodyId = seed.bodyIds[2]!;
			editor.apply(
				[
					...seed.bodyIds.map((blockId) => ({
						type: "set-props" as const,
						blockId,
						props: { type: "numberedListItem" },
					})),
					{
						type: "insert-block",
						blockId: "p6-item-4",
						blockType: "numberedListItem",
						props: {},
						position: { after: lastBodyId },
					},
					{
						type: "splice-text",
						blockId: "p6-item-4",
						from: 0,
						to: 0,
						insert: "Outlook remains steady.",
					},
				],
				{ origin: "user" },
			);
			return;
		}
		case "p7": {
			editor.apply(
				[
					{
						type: "move-block",
						blockId: seed.closingId,
						position: { before: seed.bodyIds[0]! },
					},
				],
				{ origin: "user" },
			);
			return;
		}
		case "p8": {
			editor.apply(
				seed.blockIds
					.filter((id) => seed.typeById[id] === "paragraph")
					.map((blockId) => {
						const text = seed.textById[blockId]!;
						return {
							type: "splice-text" as const,
							blockId,
							from: Math.max(1, text.length - 8),
							to: text.length,
							insert: "",
						};
					}),
				{ origin: "user" },
			);
			return;
		}
		case "p9": {
			editor.apply(
				seed.blockIds
					.filter((id) =>
						seed.textById[id]!.includes(seed.productName),
					)
					.map((blockId) => {
						const text = seed.textById[blockId]!;
						return {
							type: "splice-text" as const,
							blockId,
							from: 0,
							to: text.length,
							insert: text.replaceAll(seed.productName, "Helios"),
						};
					}),
				{ origin: "user" },
			);
			return;
		}
		case "p10": {
			editor.apply(
				[
					{
						type: "insert-block",
						blockId: "p10-heading",
						blockType: "heading",
						props: { level: 2 },
						position: { before: seed.closingId },
					},
					{
						type: "splice-text",
						blockId: "p10-heading",
						from: 0,
						to: 0,
						insert: "Outlook",
					},
					{
						type: "set-props",
						blockId: seed.closingId,
						props: { type: "blockquote" },
					},
				],
				{ origin: "user" },
			);
			return;
		}
		case "p11": {
			editor.apply(
				[
					{
						type: "format-text",
						blockId: seed.bodyIds[0]!,
						from: 0,
						to: seed.productName.length,
						marks: { textColor: { color: "red" } },
					},
				],
				{ origin: "user" },
			);
			return;
		}
		default: {
			const unseen: never = id as never;
			throw new Error(`unhandled corpus id: ${String(unseen)}`);
		}
	}
}

describe("edit channel corpus shape", () => {
	it("has eleven prompts with unique ids p1–p11", () => {
		expect(EDIT_CHANNEL_CORPUS).toHaveLength(11);
		expect(EDIT_CHANNEL_CORPUS.map((entry) => entry.id)).toEqual([
			"p1",
			"p2",
			"p3",
			"p4",
			"p5",
			"p6",
			"p7",
			"p8",
			"p9",
			"p10",
			"p11",
		]);
		expect(EDIT_CHANNEL_CORPUS.filter((entry) => entry.knownWeak)).toEqual([
			expect.objectContaining({ id: "p9" }),
		]);
	});

	it.each(EDIT_CHANNEL_CORPUS)(
		"$id postcondition passes on the correct edit and fails on the untouched seed",
		(entry) => {
			const untouched = createSeededEditor();
			const untouchedReason = entry.postcondition(
				untouched.editor,
				untouched.seed,
			);
			expect(
				untouchedReason,
				`${entry.id} passed on an unedited document`,
			).toEqual(expect.any(String));
			expect(untouchedReason!.length).toBeGreaterThan(0);
			void untouched.editor.destroy();

			const edited = createSeededEditor();
			applyCorrectEdit(entry.id, edited.editor, edited.seed);
			expect(entry.postcondition(edited.editor, edited.seed)).toBeNull();
			void edited.editor.destroy();
		},
	);

	it("p2 rejects a longer closing that dropped its original prefix", () => {
		const { editor, seed } = createSeededEditor();
		const rewritten =
			"A longer rewritten close that does not keep the original sentence.";
		expect(rewritten.length).toBeGreaterThan(seed.closingText.length);

		editor.apply(
			[
				{
					type: "splice-text",
					blockId: seed.headingId,
					from: 0,
					to: seed.headingText.length,
					insert: "Our Quarter in Review",
				},
				{
					type: "splice-text",
					blockId: seed.closingId,
					from: 0,
					to: seed.closingText.length,
					insert: rewritten,
				},
				{
					type: "insert-block",
					blockId: "p2-near-miss-table",
					blockType: "table",
					props: {},
					position: { after: seed.closingId },
				},
			],
			{ origin: "user" },
		);

		expect(EDIT_CHANNEL_CORPUS[1]!.postcondition(editor, seed)).toBe(
			"closing paragraph lost its original prefix",
		);
		void editor.destroy();
	});
});
