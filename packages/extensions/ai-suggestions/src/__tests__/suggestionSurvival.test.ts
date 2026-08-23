import { createEditor } from "@input/pen-core";
import { describe, expect, it } from "vitest";
import {
	aiSuggestionsExtension,
	getAISuggestionsController,
} from "../index";
import type { AISuggestion } from "../types";
import { defaultSchema } from "@input/pen-schema-default";

async function flushTimers(): Promise<void> {
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

function createRng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function liveSuggestions(
	suggestions: readonly AISuggestion[],
): readonly AISuggestion[] {
	return suggestions.filter((suggestion) => !suggestion.invalidated);
}

function createSuggestionsEditor() {
	return createEditor({
		schema: defaultSchema,
		extensions: [
			aiSuggestionsExtension({
				debounceMs: 0,
				minStableMs: 0,
				minChangedChars: 1,
				analyzer: {
					async analyze() {
						return {
							candidates: [
								{
									kind: "spelling",
									title: "Spelling",
									originalText: "Ths",
									replacementText: "This",
									confidence: 0.99,
								},
							],
						};
					},
				},
			}),
		],
	});
}

describe("suggestion survival under concurrent edits", () => {
	it("maps suggestions through 1k random edits and drops them only on range death", async () => {
		const editor = createSuggestionsEditor();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "Ths sentence works.",
				},
			],
			{ origin: "user" },
		);
		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		const initial = liveSuggestions(controller.getState().suggestions);
		expect(initial).toHaveLength(1);

		const random = createRng(2_026_082_0);
		for (let step = 0; step < 1000; step += 1) {
			const liveBefore = liveSuggestions(controller.getState().suggestions)[0]!;
			const text =
				editor.getBlock(liveBefore.blockId)?.textContent({ resolved: true }) ??
				"";
			if (random() < 0.5 && liveBefore.from > 0) {
				const offset = Math.floor(random() * liveBefore.from);
				editor.apply(
					[
						{
							type: "insert-text",
							blockId: liveBefore.blockId,
							offset,
							text: random() < 0.5 ? "x" : "yy",
						},
					],
					{ origin: { type: "collaborator" } },
				);
			} else if (liveBefore.to < text.length) {
				const offset =
					liveBefore.to +
					1 +
					Math.floor(random() * (text.length - liveBefore.to));
				editor.apply(
					[
						{
							type: "insert-text",
							blockId: liveBefore.blockId,
							offset,
							text: "z",
						},
					],
					{ origin: { type: "collaborator" } },
				);
			} else {
				editor.apply(
					[
						{
							type: "insert-text",
							blockId: liveBefore.blockId,
							offset: 0,
							text: "q",
						},
					],
					{ origin: { type: "collaborator" } },
				);
			}

			const live = liveSuggestions(controller.getState().suggestions);
			expect(live).toHaveLength(1);
			const haystack =
				editor.getBlock(live[0]!.blockId)?.textContent({ resolved: true }) ??
				"";
			expect(haystack.slice(live[0]!.from, live[0]!.to)).toBe("Ths");
		}

		const doomed = liveSuggestions(controller.getState().suggestions)[0]!;
		editor.apply(
			[
				{
					type: "delete-text",
					blockId: doomed.blockId,
					offset: doomed.from,
					length: doomed.to - doomed.from,
				},
			],
			{ origin: { type: "collaborator" } },
		);
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(0);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: doomed.blockId,
					offset: 0,
					text: "more",
				},
			],
			{ origin: { type: "collaborator" } },
		);
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(0);

		editor.destroy();
	});

	it("split-across-blocks: a tail suggestion follows its content", async () => {
		const editor = createSuggestionsEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "aa Ths bb",
				},
			],
			{ origin: "user" },
		);
		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(1);

		editor.apply(
			[
				{
					type: "split-block",
					blockId,
					offset: 2,
					newBlockId: "tail",
				},
			],
			{ origin: { type: "collaborator" } },
		);

		const live = liveSuggestions(controller.getState().suggestions);
		expect(live).toHaveLength(1);
		expect(live[0]?.blockId).toBe("tail");
		expect(
			editor
				.getBlock("tail")
				?.textContent()
				.slice(live[0]!.from, live[0]!.to),
		).toBe("Ths");
		expect(editor.getBlock("tail")?.textContent()).toContain("Ths");

		editor.destroy();
	});

	it("follows a suggestion across a merge", async () => {
		const editor = createSuggestionsEditor();
		const target = editor.firstBlock()!.id;
		editor.apply(
			[
				{ type: "insert-text", blockId: target, offset: 0, text: "aa " },
				{
					type: "insert-block",
					blockId: "source",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
				{ type: "insert-text", blockId: "source", offset: 0, text: "Ths zz" },
			],
			{ origin: "user" },
		);
		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		controller.request({ force: true, blockId: "source" });
		await flushTimers();
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(1);

		editor.apply(
			[
				{
					type: "merge-blocks",
					targetBlockId: target,
					sourceBlockId: "source",
				},
			],
			{ origin: { type: "collaborator" } },
		);

		const live = liveSuggestions(controller.getState().suggestions);
		expect(live).toHaveLength(1);
		expect(live[0]?.blockId).toBe(target);
		expect(
			editor.getBlock(target)?.textContent().slice(live[0]!.from, live[0]!.to),
		).toBe("Ths");

		editor.destroy();
	});

	it("AN9: 500 suggestions hold two endpoints each and do not remint on ordinary commits", async () => {
		const words = Array.from(
			{ length: 500 },
			(_, index) => `W${String(index).padStart(3, "0")}`,
		);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				aiSuggestionsExtension({
					debounceMs: 0,
					minStableMs: 0,
					minChangedChars: 1,
					maxScopeChars: 8_000,
					maxSuggestionsPerScope: 500,
					analyzer: {
						async analyze() {
							return {
								candidates: words.map((word) => ({
									kind: "spelling" as const,
									title: "Spelling",
									originalText: word,
									replacementText: `${word}x`,
									confidence: 0.99,
								})),
							};
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: words.join(" "),
				},
			],
			{ origin: "user" },
		);
		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(
			500,
		);
		const afterMint = editor.anchors.liveCount;
		expect(afterMint).toBeLessThanOrEqual(1_002);

		for (let step = 0; step < 100; step += 1) {
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "q" }],
				{ origin: { type: "collaborator" } },
			);
		}
		expect(editor.anchors.liveCount).toBe(afterMint);
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(
			500,
		);

		editor.destroy();
	});

	it("drops a suggestion when its block is removed", async () => {
		const editor = createSuggestionsEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{ type: "insert-text", blockId, offset: 0, text: "Ths here" },
				{
					type: "insert-block",
					blockId: "keep",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			{ origin: "user" },
		);
		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(1);

		editor.apply([{ type: "delete-block", blockId }], {
			origin: { type: "collaborator" },
		});
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(0);

		editor.destroy();
	});
});
