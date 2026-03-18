import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import {
	aiSuggestionsExtension,
	getAISuggestionsController,
} from "../index";

async function flushTimers(): Promise<void> {
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

describe("@pen/ai-suggestions extension", () => {
	it("registers a controller and materializes proactive suggestions", async () => {
		const editor = createEditor({
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
								usage: {
									promptTokens: 12,
									completionTokens: 5,
								},
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

		const controller = getAISuggestionsController(editor);
		expect(controller).toBeTruthy();
		expect(controller?.getState().suggestions).toHaveLength(1);
		expect(controller?.getState().metrics.successCount).toBe(1);
		expect(editor.getDecorations().decorations).toHaveLength(1);

		editor.destroy();
	});

	it("applies a suggestion through editor ops", async () => {
		const editor = createEditor({
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
		const suggestion = controller.getState().suggestions[0]!;
		expect(controller.applySuggestion(suggestion.id)).toBe(true);
		expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
			"This sentence works.",
		);

		editor.destroy();
	});

	it("caps displayed suggestions to the configured maximum after ranking", async () => {
		const editor = createEditor({
			extensions: [
				aiSuggestionsExtension({
					debounceMs: 0,
					minStableMs: 0,
					minChangedChars: 1,
					maxSuggestionsPerScope: 2,
					minConfidence: 0.7,
					analyzer: {
						async analyze() {
							return {
								candidates: [
									{
										kind: "rephrase",
										title: "Rephrase",
										originalText: "alpha",
										replacementText: "Alpha",
										confidence: 0.75,
									},
									{
										kind: "spelling",
										title: "Spelling",
										originalText: "brvo",
										replacementText: "bravo",
										confidence: 0.99,
									},
									{
										kind: "grammar",
										title: "Grammar",
										originalText: "charle",
										replacementText: "charlie",
										confidence: 0.9,
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
					text: "alpha brvo charle",
				},
			],
			{ origin: "user" },
		);

		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		const suggestions = controller.getState().suggestions;

		expect(suggestions).toHaveLength(2);
		expect(suggestions.map((suggestion) => suggestion.originalText)).toEqual([
			"brvo",
			"charle",
		]);

		editor.destroy();
	});

	it("cancels in-flight analysis and clears suggestions when disabled", async () => {
		const analysis = createDeferred<{
			candidates: Array<{
				kind: "spelling";
				title: string;
				originalText: string;
				replacementText: string;
			}>;
		}>();
		const editor = createEditor({
			extensions: [
				aiSuggestionsExtension({
					debounceMs: 0,
					minStableMs: 0,
					minChangedChars: 1,
					analyzer: {
						analyze() {
							return analysis.promise;
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Ths sentence works.",
			}],
			{ origin: "user" },
		);

		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		expect(controller.getState().status).toBe("requesting");

		controller.setEnabled(false);
		expect(controller.getState()).toMatchObject({
			enabled: false,
			status: "idle",
			activeRequestId: null,
		});
		expect(controller.getState().suggestions).toHaveLength(0);

		analysis.resolve({
			candidates: [
				{
					kind: "spelling",
					title: "Spelling",
					originalText: "Ths",
					replacementText: "This",
				},
			],
		});

		await flushTimers();

		expect(controller.getState()).toMatchObject({
			enabled: false,
			status: "idle",
			activeRequestId: null,
		});
		expect(controller.getState().suggestions).toHaveLength(0);

		editor.destroy();
	});

	it("requires a fresh edit after re-enabling proactive suggestions", async () => {
		let analyzeCallCount = 0;
		const editor = createEditor({
			extensions: [
				aiSuggestionsExtension({
					debounceMs: 0,
					minStableMs: 0,
					minChangedChars: 1,
					analyzer: {
						async analyze() {
							analyzeCallCount += 1;
							return {
								candidates: [
									{
										kind: "spelling",
										title: "Spelling",
										originalText: "Ths",
										replacementText: "This",
									},
								],
							};
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		const controller = getAISuggestionsController(editor)!;

		controller.setEnabled(false);
		editor.apply(
			[{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Ths sentence works.",
			}],
			{ origin: "user" },
		);

		await flushTimers();

		expect(analyzeCallCount).toBe(0);
		expect(controller.getState().suggestions).toHaveLength(0);

		controller.setEnabled(true);
		await flushTimers();

		expect(analyzeCallCount).toBe(0);

		editor.apply(
			[{
				type: "insert-text",
				blockId,
				offset: editor.getBlock(blockId)?.textContent({ resolved: true }).length ?? 0,
				text: "!",
			}],
			{ origin: "user" },
		);

		await flushTimers();

		expect(analyzeCallCount).toBe(1);
		expect(controller.getState().enabled).toBe(true);
		expect(controller.getState().suggestions).toHaveLength(1);

		editor.destroy();
	});
});
