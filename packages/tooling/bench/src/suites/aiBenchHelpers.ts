import {
	createEditor,
	getInlineCompletionController,
} from "@pen/core";
import { FIELD_EDITOR_SLOT_KEY, defineExtension } from "@pen/types";
import { aiExtension } from "@pen/ai";
import {
	autocompleteExtension,
	createAutocompleteProvider,
	getAutocompleteController,
} from "@pen/ai-autocomplete";
import type { AutocompleteContextProvider } from "@pen/ai-autocomplete";
import { createTestEditor } from "@pen/test";
import type { ToolRuntime } from "@pen/types";
import { buildDocumentWriteOps } from "@pen/document-ops";

export const AI_BENCH_BLOCK_COUNT = 200;
export const AI_RANGE_START_BLOCK_ID = "block-90";
export const AI_RANGE_END_BLOCK_ID = "block-109";
export function createAIBenchEditor() {
	const editor = createTestEditor({
		blocks: Array.from({ length: AI_BENCH_BLOCK_COUNT }, (_, index) => ({
			id: `block-${index}`,
			type: index % 8 === 0 ? "heading" : "paragraph",
			content:
				`Benchmark block ${index}. ` +
				"This is representative playground context for AI read latency measurement.",
		})),
	});
	const targetBlockId = AI_RANGE_START_BLOCK_ID;
	editor.selectTextRange(
		{ blockId: targetBlockId, offset: 0 },
		{ blockId: targetBlockId, offset: 18 },
	);
	return editor;
}

export function getToolRuntime(editor: ReturnType<typeof createTestEditor>): ToolRuntime {
	const toolRuntime = editor.internals.getSlot<ToolRuntime>("document-ops:toolRuntime");
	if (!toolRuntime) {
		throw new Error("AI bench editor is missing the document-ops tool runtime.");
	}
	return toolRuntime;
}

export function createAutocompleteCancelChurnBenchEditor() {
	let activeEditor: ReturnType<typeof createEditor> | null = null;
	let modelCallCount = 0;
	const fieldEditor = {
		focusBlockId: null as string | null,
		isEditing: true,
		isFocused: true,
		isComposing: false,
		activeCellCoord: null,
	};
	const editor = createEditor({
		extensions: [
			aiExtension(),
			autocompleteExtension({
				debounceMs: 10,
				model: {
					async *stream() {
						modelCallCount += 1;
						yield { type: "text-delta" as const, delta: " value" };
						yield { type: "done" as const };
					},
				},
			}),
			defineExtension({
				name: "bench-field-editor-slot",
				activateClient: async ({ editor: nextEditor }) => {
					activeEditor = nextEditor;
					nextEditor.internals.setSlot(FIELD_EDITOR_SLOT_KEY, fieldEditor);
				},
				deactivateClient: async () => {
					activeEditor?.internals.setSlot(FIELD_EDITOR_SLOT_KEY, null);
					activeEditor = null;
				},
			}),
		],
	});
	const firstBlockId = editor.firstBlock()!.id;
	const codeBlockId = "bench-code-block";
	editor.apply([
		{
			type: "insert-block",
			blockId: codeBlockId,
			blockType: "codeBlock",
			props: {},
			position: { after: firstBlockId },
		},
		{
			type: "insert-text",
			blockId: codeBlockId,
			offset: 0,
			text: "const answer =",
		},
	]);
	fieldEditor.focusBlockId = codeBlockId;
	editor.selectText(codeBlockId, 14, 14);
	const controller = getAutocompleteController(editor);
	if (!controller) {
		throw new Error("Autocomplete bench editor is missing the autocomplete controller.");
	}
	return {
		editor,
		controller,
		getModelCallCount: () => modelCallCount,
	};
}

export function createAutocompleteRequestingCancelChurnBenchEditor() {
	let modelCallCount = 0;
	const benchEditor = createAutocompleteBenchEditor({
		benchExtensionName: "bench-requesting-field-editor-slot",
		debounceMs: 0,
		blockId: "bench-requesting-code-block",
		blockType: "codeBlock",
		initialText: "const answer =",
		modelStream: async function* () {
			modelCallCount += 1;
			await new Promise((resolve) => setTimeout(resolve, 0));
			yield { type: "text-delta" as const, delta: " value" };
			yield { type: "done" as const };
		},
	});
	return {
		...benchEditor,
		getModelCallCount: () => modelCallCount,
	};
}

export function createAutocompletePartialAcceptBenchEditor() {
	let modelCallCount = 0;
	const benchEditor = createAutocompleteBenchEditor({
		benchExtensionName: "bench-partial-accept-field-editor-slot",
		debounceMs: 0,
		blockId: "bench-partial-accept-block",
		initialText: "Hello",
		cursorOffset: 5,
		modelStream: async function* () {
			modelCallCount += 1;
			yield {
				type: "text-delta" as const,
				delta: " bright future together today",
			};
			yield { type: "done" as const };
		},
	});
	return {
		...benchEditor,
		getModelCallCount: () => modelCallCount,
	};
}

export function createAutocompleteProviderBudgetBenchEditor() {
	let modelCallCount = 0;
	const benchEditor = createAutocompleteBenchEditor({
		benchExtensionName: "bench-provider-budget-field-editor-slot",
		debounceMs: 0,
		maxProviderChars: 48,
		maxProviderTimeMs: 5,
		blockId: "bench-provider-budget-block",
		initialText: "Hello",
		cursorOffset: 5,
		providers: [
			createAutocompleteProvider({
				id: "local-shape",
				priority: 300,
				provide() {
					return "shape: paragraph";
				},
			}),
			createAutocompleteProvider({
				id: "consumer-clipped",
				priority: 200,
				provide() {
					return "consumer context that should be clipped by the shared provider budget";
				},
			}),
			createAutocompleteProvider({
				id: "slow-timeout",
				priority: 150,
				async provide() {
					await new Promise((resolve) => setTimeout(resolve, 20));
					return "slow provider should not be included";
				},
			}),
		],
		modelStream: async function* () {
			modelCallCount += 1;
			yield { type: "text-delta" as const, delta: " world" };
			yield { type: "done" as const };
		},
	});
	return {
		...benchEditor,
		getModelCallCount: () => modelCallCount,
	};
}

export function createAutocompletePrefetchAfterAcceptBenchEditor() {
	let modelCallCount = 0;
	const benchEditor = createAutocompleteBenchEditor({
		benchExtensionName: "bench-prefetch-field-editor-slot",
		debounceMs: 0,
		prefetchAfterAccept: true,
		blockId: "bench-prefetch-block",
		initialText: "Hello",
		cursorOffset: 5,
		modelStream: async function* () {
			modelCallCount += 1;
			if (modelCallCount === 1) {
				yield { type: "text-delta" as const, delta: " world from pen" };
				yield { type: "done" as const };
				return;
			}
			yield { type: "text-delta" as const, delta: "from pen again" };
			yield { type: "done" as const };
		},
	});
	const inlineCompletion = getInlineCompletionController(benchEditor.editor);
	if (!inlineCompletion) {
		throw new Error("Autocomplete bench editor is missing the inline completion controller.");
	}
	return {
		...benchEditor,
		getModelCallCount: () => modelCallCount,
		getVisibleSuggestionText: () =>
			inlineCompletion.getState().visibleSuggestion?.text ?? "",
	};
}

export function createAutocompleteBenchEditor(input: {
	benchExtensionName: string;
	debounceMs: number;
	modelStream: () => AsyncGenerator<
		{ type: "text-delta"; delta: string } | { type: "done" },
		void,
		unknown
	>;
	prefetchAfterAccept?: boolean;
	maxProviderChars?: number;
	maxProviderTimeMs?: number;
	providers?: readonly AutocompleteContextProvider[];
	blockId: string;
	blockType?: string;
	initialText: string;
	cursorOffset?: number;
}) {
	let activeEditor: ReturnType<typeof createEditor> | null = null;
	const fieldEditor = {
		focusBlockId: null as string | null,
		isEditing: true,
		isFocused: true,
		isComposing: false,
		activeCellCoord: null,
	};
	const editor = createEditor({
		extensions: [
			aiExtension(),
			autocompleteExtension({
				debounceMs: input.debounceMs,
				prefetchAfterAccept: input.prefetchAfterAccept,
				maxProviderChars: input.maxProviderChars,
				maxProviderTimeMs: input.maxProviderTimeMs,
				providers: input.providers,
				model: {
					stream: input.modelStream,
				},
			}),
			defineExtension({
				name: input.benchExtensionName,
				activateClient: async ({ editor: nextEditor }) => {
					activeEditor = nextEditor;
					nextEditor.internals.setSlot(FIELD_EDITOR_SLOT_KEY, fieldEditor);
				},
				deactivateClient: async () => {
					activeEditor?.internals.setSlot(FIELD_EDITOR_SLOT_KEY, null);
					activeEditor = null;
				},
			}),
		],
	});
	const firstBlockId = editor.firstBlock()!.id;
	if (input.blockType) {
		editor.apply([
			{
				type: "insert-block",
				blockId: input.blockId,
				blockType: input.blockType,
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: input.blockId,
				offset: 0,
				text: input.initialText,
			},
		]);
	} else {
		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: input.initialText,
			},
		]);
	}

	const targetBlockId = input.blockType ? input.blockId : firstBlockId;
	const cursorOffset = input.cursorOffset ?? input.initialText.length;
	fieldEditor.focusBlockId = targetBlockId;
	editor.selectText(targetBlockId, cursorOffset, cursorOffset);

	const controller = getAutocompleteController(editor);
	if (!controller) {
		throw new Error("Autocomplete bench editor is missing the autocomplete controller.");
	}
	return {
		editor,
		controller,
	};
}

export function expectControllerRequest(value: boolean): void {
	if (!value) {
		throw new Error("Autocomplete bench operation unexpectedly returned false.");
	}
}

export async function waitForCondition(
	check: () => boolean,
	maxTicks = 20,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (check()) {
			return;
		}
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("Condition was not met in time.");
}

export function buildPromptAssemblyMessages(input: {
	prompt: string;
	workingSet: string;
	toolResults: Array<{
		toolCallId: string;
		toolName: string;
		input: unknown;
		output: unknown;
	}>;
}) {
	return [
		{
			role: "user",
			content: `${input.workingSet}\n\nUser request:\n${input.prompt}`,
		},
		...input.toolResults.flatMap((toolResult) => [
			{
				role: "assistant",
				content: [{
					type: "tool-call",
					toolCallId: toolResult.toolCallId,
					toolName: toolResult.toolName,
					input: toolResult.input,
				}],
			},
			{
				role: "tool",
				content: [{
					type: "tool-result",
					toolCallId: toolResult.toolCallId,
					result: toolResult.output,
				}],
			},
		]),
	];
}

