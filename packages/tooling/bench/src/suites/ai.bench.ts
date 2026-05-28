import { getInlineCompletionController } from "@pen/core";
import { buildDocumentWriteOps } from "@pen/document-ops";
import {
	applyBenchMarkdownFastApply,
	parseBenchMarkdownFastApplyContract,
} from "../utils/markdownFastApply";
import {
	buildBenchFlowPatchAlignmentExecution,
	buildBenchFlowPatchScopedReplacementExecution,
	buildBenchFlowPatchTextEditExecution,
} from "../utils/flowPatchExecution";
import type { BenchDefinition } from "../bench";
import {
	AI_FLOW_PATCH_ALIGNMENT_BENCH,
	AI_FLOW_PATCH_SCOPED_REPLACEMENT_BENCH,
	AI_GET_CONTEXT_SUMMARY_200_BLOCKS_BENCH,
	AI_GET_CURSOR_CONTEXT_BENCH,
	AI_AUTOCOMPLETE_CANCEL_CHURN_BENCH,
	AI_AUTOCOMPLETE_PROVIDER_BUDGET_BENCH,
	AI_AUTOCOMPLETE_PARTIAL_ACCEPT_BENCH,
	AI_AUTOCOMPLETE_PREFETCH_AFTER_ACCEPT_BENCH,
	AI_AUTOCOMPLETE_REQUESTING_CANCEL_CHURN_BENCH,
	AI_MARKDOWN_FAST_APPLY_TABLE_INSERT_BENCH,
	AI_MARKDOWN_FULL_REPLACE_TABLE_INSERT_BENCH,
	AI_PROMPT_ASSEMBLY_TOOL_JOURNAL_BENCH,
	AI_READ_DOCUMENT_RANGE_20_BLOCKS_BENCH,
	AI_READ_DOCUMENT_SUMMARY_200_BLOCKS_BENCH,
	AI_RETRIEVE_DOCUMENT_SPANS_BENCH,
	AI_FLOW_PATCH_TEXT_EDIT_BENCH,
} from "../constants/benchmarks";
import {
	AI_RANGE_END_BLOCK_ID,
	AI_RANGE_START_BLOCK_ID,
	buildPromptAssemblyMessages,
	createAIBenchEditor,
	createAutocompleteCancelChurnBenchEditor,
	createAutocompletePartialAcceptBenchEditor,
	createAutocompletePrefetchAfterAcceptBenchEditor,
	createAutocompleteProviderBudgetBenchEditor,
	createAutocompleteRequestingCancelChurnBenchEditor,
	expectControllerRequest,
	getToolRuntime,
	waitForCondition,
} from "./aiBenchHelpers";


export const aiBenchmarks: BenchDefinition[] = [
	{
		...AI_READ_DOCUMENT_SUMMARY_200_BLOCKS_BENCH,
		async fn(b) {
			const editor = createAIBenchEditor();
			const toolRuntime = getToolRuntime(editor);

			b.start();
			await toolRuntime.executeTool("read_document", { format: "summary" }, {} as never);
			b.end();
		},
	},
	{
		...AI_GET_CONTEXT_SUMMARY_200_BLOCKS_BENCH,
		async fn(b) {
			const editor = createAIBenchEditor();
			const toolRuntime = getToolRuntime(editor);

			b.start();
			await toolRuntime.executeTool(
				"get_context",
				{ format: "summary", includeSelection: true },
				{} as never,
			);
			b.end();
		},
	},
	{
		...AI_GET_CURSOR_CONTEXT_BENCH,
		async fn(b) {
			const editor = createAIBenchEditor();
			const toolRuntime = getToolRuntime(editor);

			b.start();
			await toolRuntime.executeTool("get_cursor_context", {}, {} as never);
			b.end();
		},
	},
	{
		...AI_READ_DOCUMENT_RANGE_20_BLOCKS_BENCH,
		async fn(b) {
			const editor = createAIBenchEditor();
			const toolRuntime = getToolRuntime(editor);

			b.start();
			await toolRuntime.executeTool(
				"read_document",
				{
					format: "markdown",
					range: {
						startBlockId: AI_RANGE_START_BLOCK_ID,
						endBlockId: AI_RANGE_END_BLOCK_ID,
					},
				},
				{} as never,
			);
			b.end();
		},
	},
	{
		...AI_PROMPT_ASSEMBLY_TOOL_JOURNAL_BENCH,
		fn(b) {
			const toolResults = Array.from({ length: 8 }, (_, index) => ({
				toolCallId: `tool-${index}`,
				toolName: "read_document",
				input: {
					format: "summary",
					range: {
						startBlockId: `block-${index}`,
						endBlockId: `block-${index + 1}`,
					},
				},
				output: {
					blockCount: 2,
					blocks: Array.from({ length: 4 }, (__, blockIndex) => ({
						id: `block-${index}-${blockIndex}`,
						type: "paragraph",
						preview: "Benchmark output for prompt assembly.",
					})),
				},
			}));

			b.start();
			buildPromptAssemblyMessages({
				prompt: "Continue the current section.",
				workingSet: JSON.stringify({
					source: "cursor-context",
					surroundingBlocks: ["A", "B", "C"],
				}),
				toolResults,
			});
			b.end();
		},
	},
	{
		...AI_RETRIEVE_DOCUMENT_SPANS_BENCH,
		async fn(b) {
			const editor = createAIBenchEditor();
			const toolRuntime = getToolRuntime(editor);

			b.start();
			await toolRuntime.executeTool(
				"retrieve_document_spans",
				{
					query: "find the benchmark block about latency measurement near block 90",
					targetBlockId: AI_RANGE_START_BLOCK_ID,
					activeBlockId: AI_RANGE_START_BLOCK_ID,
				},
				{} as never,
			);
			b.end();
		},
	},
	{
		...AI_MARKDOWN_FAST_APPLY_TABLE_INSERT_BENCH,
		fn(b) {
			const contract = parseBenchMarkdownFastApplyContract(`
<pen-fast-apply>
  <instructions>I am inserting a people table after the intro paragraph.</instructions>
  <anchorBefore><![CDATA[Benchmark block 90. This is representative playground context for AI read latency measurement.]]></anchorBefore>
  <anchorAfter><![CDATA[Benchmark block 91. This is representative playground context for AI read latency measurement.]]></anchorAfter>
  <patch><![CDATA[
<!-- ... existing markdown ... -->

| Name | Role |
| --- | --- |
| Alice | Design |
| Bob | Engineering |
<!-- ... existing markdown ... -->
  ]]></patch>
</pen-fast-apply>
`);
			const originalMarkdown = [
				"Benchmark block 90. This is representative playground context for AI read latency measurement.",
				"",
				"Benchmark block 91. This is representative playground context for AI read latency measurement.",
			].join("\n");

			b.start();
			applyBenchMarkdownFastApply({
				originalMarkdown,
				contract: contract!,
			});
			b.end();
		},
	},
	{
		...AI_MARKDOWN_FULL_REPLACE_TABLE_INSERT_BENCH,
		fn(b) {
			const editor = createAIBenchEditor();
			const replacementMarkdown = [
				"Benchmark block 90. This is representative playground context for AI read latency measurement.",
				"",
				"| Name | Role |",
				"| --- | --- |",
				"| Alice | Design |",
				"| Bob | Engineering |",
				"",
				"Benchmark block 91. This is representative playground context for AI read latency measurement.",
			].join("\n");

			b.start();
			buildDocumentWriteOps(editor, {
				format: "markdown",
				content: replacementMarkdown,
				position: { before: AI_RANGE_START_BLOCK_ID },
				surface: "bench:ai-markdown-full-replace",
			});
			b.end();
		},
	},
	{
		...AI_FLOW_PATCH_TEXT_EDIT_BENCH,
		fn(b) {
			const editor = createAIBenchEditor();

			b.start();
			buildBenchFlowPatchTextEditExecution(
				editor,
				AI_RANGE_START_BLOCK_ID,
				"Benchmark block 90 updated for native patch compilation.",
			);
			b.end();
		},
	},
	{
		...AI_FLOW_PATCH_ALIGNMENT_BENCH,
		fn(b) {
			const editor = createAIBenchEditor();

			b.start();
			const result = buildBenchFlowPatchAlignmentExecution(editor);
			b.end();
			b.setMetrics({
				executionPath: "native-fast-apply",
				preservedBlockCount: result.metrics.preservedBlockCount,
				rewrittenBlockCount: result.metrics.rewrittenBlockCount,
				unchangedBlockCount: result.metrics.unchangedBlockCount,
				insertedBlockCount: result.metrics.insertedBlockCount,
				deletedBlockCount: result.metrics.deletedBlockCount,
				estimatedOperationCost: result.metrics.estimatedOperationCost,
				opCount: result.ops.length,
			});
		},
	},
	{
		...AI_FLOW_PATCH_SCOPED_REPLACEMENT_BENCH,
		fn(b) {
			const editor = createAIBenchEditor();

			b.start();
			const result = buildBenchFlowPatchScopedReplacementExecution(editor);
			b.end();
			b.setMetrics({
				executionPath: result.metrics.kind,
				opsCount: result.metrics.opsCount,
				insertedBlockCount: result.metrics.insertedBlockCount,
				deletedBlockCount: result.metrics.deletedBlockCount,
				targetBlockCount: result.metrics.targetBlockCount,
			});
		},
	},
	{
		...AI_AUTOCOMPLETE_CANCEL_CHURN_BENCH,
		fn(b) {
			const cycleCount = 25;
			const {
				controller,
				editor,
				getModelCallCount,
			} = createAutocompleteCancelChurnBenchEditor();

			b.start();
			for (let index = 0; index < cycleCount; index += 1) {
				controller.request();
				controller.updateBlockPolicy({ allowInCodeBlocks: false });
				controller.updateBlockPolicy({ allowInCodeBlocks: true });
			}
			b.end();

			const metrics = controller.getState().metrics;
			b.setMetrics({
				cycleCount,
				requestCount: metrics.requestCount,
				cancelCount: metrics.cancelCount,
				policyInvalidationScheduledCount:
					metrics.policyInvalidationScheduledCount,
				modelCallCount: getModelCallCount(),
			});
			editor.destroy();
		},
	},
	{
		...AI_AUTOCOMPLETE_REQUESTING_CANCEL_CHURN_BENCH,
		async fn(b) {
			const cycleCount = 10;
			const {
				controller,
				editor,
				getModelCallCount,
			} = createAutocompleteRequestingCancelChurnBenchEditor();

			b.start();
			for (let index = 0; index < cycleCount; index += 1) {
				controller.request({ explicit: true });
				await waitForCondition(
					() => controller.getState().status === "requesting",
				);
				controller.updateBlockPolicy({ allowInCodeBlocks: false });
				await waitForCondition(() => controller.getState().status === "idle");
				controller.updateBlockPolicy({ allowInCodeBlocks: true });
			}
			b.end();

			const metrics = controller.getState().metrics;
			b.setMetrics({
				cycleCount,
				requestCount: metrics.requestCount,
				cancelCount: metrics.cancelCount,
				policyInvalidationRequestingCount:
					metrics.policyInvalidationRequestingCount,
				modelCallCount: getModelCallCount(),
			});
			editor.destroy();
		},
	},
	{
		...AI_AUTOCOMPLETE_PROVIDER_BUDGET_BENCH,
		async fn(b) {
			const {
				controller,
				editor,
				getModelCallCount,
			} = createAutocompleteProviderBudgetBenchEditor();

			b.start();
			expectControllerRequest(controller.request({ explicit: true }));
			await waitForCondition(
				() => controller.getState().providerTimings.length > 0,
				80,
			);
			b.end();

			const providerTimings = controller.getState().providerTimings;
			const totalProviderChars = providerTimings.reduce(
				(total, timing) => total + timing.chars,
				0,
			);
			b.setMetrics({
				includedProviderCount: providerTimings.length,
				totalProviderChars,
				slowProviderIncluded: providerTimings.some(
					(timing) => timing.id === "slow-timeout",
				),
				clippedProviderChars:
					providerTimings.find((timing) => timing.id === "consumer-clipped")
						?.chars ?? 0,
				modelCallCount: getModelCallCount(),
			});
			editor.destroy();
		},
	},
	{
		...AI_AUTOCOMPLETE_PARTIAL_ACCEPT_BENCH,
		async fn(b) {
			const {
				controller,
				editor,
				getModelCallCount,
			} = createAutocompletePartialAcceptBenchEditor();

			expectControllerRequest(controller.request({ explicit: true }));
			await waitForCondition(() => controller.hasVisibleSuggestion());

			const initialVisibleSuggestionLength =
				getInlineCompletionController(editor)?.getState().visibleSuggestion?.text.length ?? 0;
			let acceptStepCount = 0;

			b.start();
			while (controller.hasVisibleSuggestion()) {
				expectControllerRequest(controller.acceptVisibleSuggestion());
				acceptStepCount += 1;
			}
			b.end();

			const metrics = controller.getState().metrics;
			b.setMetrics({
				acceptStepCount,
				initialVisibleSuggestionLength,
				acceptCount: metrics.acceptCount,
				modelCallCount: getModelCallCount(),
			});
			editor.destroy();
		},
	},
	{
		...AI_AUTOCOMPLETE_PREFETCH_AFTER_ACCEPT_BENCH,
		async fn(b) {
			const {
				controller,
				editor,
				getModelCallCount,
				getVisibleSuggestionText,
			} = createAutocompletePrefetchAfterAcceptBenchEditor();

			expectControllerRequest(controller.request({ explicit: true }));
			await waitForCondition(() => getVisibleSuggestionText() === " world from pen");

			b.start();
			expectControllerRequest(controller.acceptVisibleSuggestion());
			await waitForCondition(() => getModelCallCount() === 2);
			b.end();

			const metrics = controller.getState().metrics;
			b.setMetrics({
				acceptCount: metrics.acceptCount,
				modelCallCount: getModelCallCount(),
				finalVisibleSuggestionLength: getVisibleSuggestionText().length,
			});
			editor.destroy();
		},
	},
];

