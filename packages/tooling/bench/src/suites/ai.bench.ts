import { createTestEditor } from "@pen/test";
import type { ToolRuntime } from "@pen/types";
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
	AI_MARKDOWN_FAST_APPLY_TABLE_INSERT_BENCH,
	AI_MARKDOWN_FULL_REPLACE_TABLE_INSERT_BENCH,
	AI_PROMPT_ASSEMBLY_TOOL_JOURNAL_BENCH,
	AI_READ_DOCUMENT_RANGE_20_BLOCKS_BENCH,
	AI_READ_DOCUMENT_SUMMARY_200_BLOCKS_BENCH,
	AI_RETRIEVE_DOCUMENT_SPANS_BENCH,
	AI_FLOW_PATCH_TEXT_EDIT_BENCH,
} from "../constants/benchmarks";

const AI_BENCH_BLOCK_COUNT = 200;
const AI_RANGE_START_BLOCK_ID = "block-90";
const AI_RANGE_END_BLOCK_ID = "block-109";

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
];

function createAIBenchEditor() {
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

function getToolRuntime(editor: ReturnType<typeof createTestEditor>): ToolRuntime {
	const toolRuntime = editor.internals.getSlot<ToolRuntime>("document-ops:toolRuntime");
	if (!toolRuntime) {
		throw new Error("AI bench editor is missing the document-ops tool runtime.");
	}
	return toolRuntime;
}

function buildPromptAssemblyMessages(input: {
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

