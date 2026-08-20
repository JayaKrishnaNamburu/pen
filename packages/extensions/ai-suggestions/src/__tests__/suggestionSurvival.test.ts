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

describe("suggestion survival under concurrent edits", () => {
	it("maps suggestions through 1k random edits and drops them only on range death", async () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [
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

		let expected = {
			blockId: initial[0]!.blockId,
			from: initial[0]!.from,
			to: initial[0]!.to,
		};

		const random = createRng(2_026_082_0);
		for (let step = 0; step < 1000; step += 1) {
			const text =
				editor.getBlock(expected.blockId)?.textContent({ resolved: true }) ??
				"";
			if (random() < 0.5) {
				const offset = Math.floor(random() * (expected.from + 1));
				editor.apply(
					[
						{
							type: "insert-text",
							blockId: expected.blockId,
							offset,
							text: random() < 0.5 ? "x" : "yy",
						},
					],
					{ origin: { type: "collaborator" } },
				);
			} else if (expected.to < text.length) {
				const offset =
					expected.to +
					Math.floor(random() * (text.length - expected.to + 1));
				editor.apply(
					[
						{
							type: "insert-text",
							blockId: expected.blockId,
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
							blockId: expected.blockId,
							offset: 0,
							text: "q",
						},
					],
					{ origin: { type: "collaborator" } },
				);
			}

			const mapped = editor.lastChangeSummary?.mapRange(
				{
					anchor: { blockId: expected.blockId, offset: expected.from },
					focus: { blockId: expected.blockId, offset: expected.to },
				},
				{ mode: "delete" },
			);
			expect(mapped).not.toBeNull();
			expect(mapped?.anchor.blockId).toBe(mapped?.focus.blockId);
			expected = {
				blockId: mapped!.anchor.blockId,
				from: Math.min(mapped!.anchor.offset, mapped!.focus.offset),
				to: Math.max(mapped!.anchor.offset, mapped!.focus.offset),
			};

			const live = liveSuggestions(controller.getState().suggestions);
			expect(live).toHaveLength(1);
			expect(live[0]).toMatchObject(expected);
		}

		editor.apply(
			[
				{
					type: "delete-text",
					blockId: expected.blockId,
					offset: expected.from,
					length: expected.to - expected.from,
				},
			],
			{ origin: { type: "collaborator" } },
		);

		const destroyed = editor.lastChangeSummary?.mapRange(
			{
				anchor: { blockId: expected.blockId, offset: expected.from },
				focus: { blockId: expected.blockId, offset: expected.to },
			},
			{ mode: "delete" },
		);
		const destroyedFrom = destroyed
			? Math.min(destroyed.anchor.offset, destroyed.focus.offset)
			: 0;
		const destroyedTo = destroyed
			? Math.max(destroyed.anchor.offset, destroyed.focus.offset)
			: 0;
		expect(destroyed == null || destroyedFrom === destroyedTo).toBe(true);
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(
			0,
		);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: expected.blockId,
					offset: 0,
					text: "more",
				},
			],
			{ origin: { type: "collaborator" } },
		);
		expect(liveSuggestions(controller.getState().suggestions)).toHaveLength(
			0,
		);

		editor.destroy();
	});
});
