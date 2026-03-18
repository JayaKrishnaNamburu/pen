import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import { buildPlaygroundRequestPlan } from "../runtime/playgroundPlanner";
import { buildStructuredIntentRequestPrompt } from "../runtime/structuredIntent";

const TEST_PLANNER_CONFIG = {
	documentModel: "test-document-model",
	selectionModel: "test-selection-model",
	documentSystemPrompt: "Document system prompt",
	structuredPlannerSystemPrompt: "Structured planner system prompt",
	selectionFastPathSystemPrompt: "Selection system prompt",
	autocompleteSystemPrompt: "Autocomplete system prompt",
	selectionSourceCharLimit: 12_000,
	selectionStopSentinel: "<pen:end>",
	selectionOutputTokenCap: 1_200,
	autocompleteOutputTokenCap: 48,
	selectionDefaultOutputTokens: 128,
	selectionExpandOutputTokens: 640,
	selectionSummarizeOutputTokens: 160,
	selectionTranslateOutputTokens: 480,
} as const;

describe("playground planner", () => {
	it("builds document-agent prompts that avoid assistant-style lead-ins", () => {
		const editor = createEditor();
		const plan = buildPlaygroundRequestPlan(
			editor,
			"Write a short story about the sea",
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("document-agent");
		expect(plan.prompt).toContain(
			"When you answer with document content, return only the content to insert or apply.",
		);
		expect(plan.prompt).toContain(
			'Do not add conversational lead-ins like "Here is", "Here\'s", or "I wrote".',
		);
	});

	it("preserves structured planner prompts as raw JSON-planning requests", () => {
		const editor = createEditor();
		const prompt = [
			"Produce a structured Pen document mutation plan.",
			"Return exactly one JSON object and no markdown fences or prose.",
			'User request:',
			"Create a table with names",
		].join("\n");
		const plan = buildPlaygroundRequestPlan(
			editor,
			prompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("structured-generation");
		expect(plan.systemPrompt).toBe("Structured planner system prompt");
		expect(plan.prompt).toBe(prompt);
		expect(plan.contextFormat).toBe("none");
		expect(plan.useTools).toBe(false);
		expect(plan.promptContext).toBeNull();
	});

	it("detects structured planner prompts when wrapped in working-set context", () => {
		const editor = createEditor();
		const wrappedPrompt = [
			"Working set:",
			'{"activeBlockType":"paragraph"}',
			"",
			"User request:",
			"Produce a structured Pen document mutation plan.",
			"Return exactly one JSON object and no markdown fences or prose.",
			'User request:',
			"Create a table with names",
		].join("\n");
		const plan = buildPlaygroundRequestPlan(
			editor,
			wrappedPrompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("structured-generation");
		expect(plan.prompt).toBe(wrappedPrompt);
		expect(plan.useTools).toBe(false);
	});

	it("treats structured intent envelopes as the shared structured route contract", () => {
		const editor = createEditor();
		const prompt = buildStructuredIntentRequestPrompt({
			prompt: "Create a database with names",
			targetKind: "database",
			activeBlockId: "anchor-block",
			workingSet: null,
		});
		const plan = buildPlaygroundRequestPlan(
			editor,
			prompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("structured-generation");
		expect(plan.prompt).toBe(prompt);
		expect(plan.useTools).toBe(false);
		expect(plan.contextFormat).toBe("none");
	});

	it("routes inline autocomplete prompts through the fast no-tools path", () => {
		const editor = createEditor();
		const prompt = [
			'prefix="Hey there,"',
			"cursor_here=true",
			'suffix=""',
			"[provider:block-shape]",
			"block_type=paragraph",
		].join("\n");
		const plan = buildPlaygroundRequestPlan(
			editor,
			prompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("inline-autocomplete");
		expect(plan.modelId).toBe("test-selection-model");
		expect(plan.systemPrompt).toBe("Autocomplete system prompt");
		expect(plan.prompt).toBe(prompt);
		expect(plan.contextFormat).toBe("none");
		expect(plan.useTools).toBe(false);
		expect(plan.maxOutputTokens).toBe(48);
		expect(plan.promptContext).toBeNull();
	});

	it("routes selection prompts through the fast path when live selection is present", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([{
			type: "insert-text",
			blockId,
			offset: 0,
			text: "Hello there",
		}]);
		editor.selectText(blockId, 0, 5);

		const plan = buildPlaygroundRequestPlan(
			editor,
			"Rewrite to be friendlier\n\nHello",
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("selection-fast");
		expect(plan.modelId).toBe("test-selection-model");
		expect(plan.useTools).toBe(false);
		expect(plan.selectedTextLength).toBe(5);
		expect(plan.prompt).toContain("Instruction:\nRewrite to be friendlier");
		expect(plan.prompt).toContain("Selected text:\nHello");
	});

	it("honors explicit selection-fast requests for inline edit flows", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([{
			type: "insert-text",
			blockId,
			offset: 0,
			text: "Hello there",
		}]);
		editor.selectText(blockId, 0, 5);

		const plan = buildPlaygroundRequestPlan(
			editor,
			"Make this friendlier",
			TEST_PLANNER_CONFIG,
			"selection-fast",
		);

		expect(plan.mode).toBe("selection-fast");
		expect(plan.prompt).toContain("Instruction:\nMake this friendlier");
		expect(plan.prompt).toContain("Selected text:\nHello");
	});

	it("rejects explicit selection-fast requests when no selection is available", () => {
		const editor = createEditor();

		expect(() =>
			buildPlaygroundRequestPlan(
				editor,
				"Make this friendlier",
				TEST_PLANNER_CONFIG,
				"selection-fast",
			),
		).toThrow(
			"Explicit selection-fast requests require a live or pinned text selection.",
		);
	});

	it("honors explicit selection-fast requests from a rewrite-selection operation without live selection", () => {
		const editor = createEditor();
		const plan = buildPlaygroundRequestPlan(
			editor,
			"Make this friendlier",
			TEST_PLANNER_CONFIG,
			"selection-fast",
			{
				kind: "rewrite-selection",
				applyPolicy: "selection-replace",
				target: {
					kind: "selection",
					blockId: "block-1",
					anchor: { blockId: "block-1", offset: 0 },
					focus: { blockId: "block-1", offset: 5 },
					sourceText: "Hello",
				},
				provenance: {
					documentVersion: 1,
				},
			},
		);

		expect(plan.mode).toBe("selection-fast");
		expect(plan.prompt).toContain("Instruction:\nMake this friendlier");
		expect(plan.prompt).toContain("Selected text to replace:\nHello");
		expect(plan.prompt).toContain(
			"Wrap the rewritten replacement text exactly like this:",
		);
		expect(plan.selectedTextLength).toBe(5);
	});

	it("honors explicit selection-fast requests from block-local operations without live selection", () => {
		const editor = createEditor();
		const plan = buildPlaygroundRequestPlan(
			editor,
			"Rewrite this",
			TEST_PLANNER_CONFIG,
			"selection-fast",
			{
				kind: "rewrite-block",
				applyPolicy: "block-replace",
				target: {
					kind: "block",
					blockId: "block-1",
					blockType: "paragraph",
					sourceText: "Hello",
				},
				provenance: {
					documentVersion: 1,
					blockRevision: 2,
				},
			},
		);

		expect(plan.mode).toBe("selection-fast");
		expect(plan.modelId).toBe("test-selection-model");
		expect(plan.prompt).toContain("Instruction:\nRewrite this");
		expect(plan.prompt).toContain("Block type: paragraph");
		expect(plan.prompt).toContain("Current block content:\nHello");
		expect(plan.selectedTextLength).toBe(5);
	});

	it("preserves authoritative source text for explicit continue-block operations", () => {
		const editor = createEditor();
		const plan = buildPlaygroundRequestPlan(
			editor,
			"Continue this thought",
			TEST_PLANNER_CONFIG,
			"selection-fast",
			{
				kind: "continue-block",
				applyPolicy: "block-continue",
				target: {
					kind: "block",
					blockId: "block-1",
					blockType: "paragraph",
					sourceText: "Hello there",
					insertionOffset: 5,
				},
				provenance: {
					documentVersion: 1,
					blockRevision: 2,
				},
			},
		);

		expect(plan.mode).toBe("selection-fast");
		expect(plan.prompt).toContain("Instruction:\nContinue this thought");
		expect(plan.prompt).toContain("Text before cursor:\nHello");
		expect(plan.prompt).toContain("Text after cursor:\n there");
		expect(plan.selectedTextLength).toBe("Hello there".length);
	});

	it("keeps selection prompts on the fast path when the prompt is pinned to a selection", () => {
		const editor = createEditor();
		const prompt = [
			"You are writing Pen flow content as markdown.",
			"Return only markdown content. Do not add commentary, JSON, or conversational lead-ins.",
			"",
			"Context summary:",
			"Source: selection",
			"Selected text:",
			"Hello there",
			"",
			"User request:",
			"Rewrite to be friendlier",
		].join("\n");

		const plan = buildPlaygroundRequestPlan(
			editor,
			prompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("selection-fast");
		expect(plan.modelId).toBe("test-selection-model");
		expect(plan.useTools).toBe(false);
		expect(plan.selectedTextLength).toBe("Hello there".length);
		expect(plan.prompt).toContain("Instruction:\nRewrite to be friendlier");
		expect(plan.prompt).toContain("Selected text:\nHello there");
	});

	it("does not treat non-selection context summaries as selection fast-path prompts", () => {
		const editor = createEditor();
		const prompt = [
			"You are writing Pen flow content as markdown.",
			"",
			"Context summary:",
			"Source: cursor-context",
			"Selected text:",
			"Hello there",
			"",
			"User request:",
			"Rewrite to be friendlier",
		].join("\n");

		const plan = buildPlaygroundRequestPlan(
			editor,
			prompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("document-agent");
	});

	it("honors explicit document-agent requests even when a live selection exists", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply([{
			type: "insert-text",
			blockId,
			offset: 0,
			text: "Hello there",
		}]);
		editor.selectText(blockId, 0, 5);

		const plan = buildPlaygroundRequestPlan(
			editor,
			"Rewrite to be friendlier\n\nHello",
			TEST_PLANNER_CONFIG,
			"document-agent",
		);

		expect(plan.mode).toBe("document-agent");
		expect(plan.useTools).toBe(false);
		expect(plan.contextFormat).toBe("json");
	});

	it("includes explicit document operation envelopes in document-agent prompts", () => {
		const editor = createEditor();
		const plan = buildPlaygroundRequestPlan(
			editor,
			"Remove all content",
			TEST_PLANNER_CONFIG,
			"document-agent",
			{
				kind: "document-transform",
				applyPolicy: "document-review",
				target: {
					kind: "document",
					activeBlockId: "block-1",
					blockIds: ["block-1", "block-2"],
					placement: "replace-blocks",
					transform: "remove",
				},
				provenance: {
					documentVersion: 3,
					syncedGeneration: 5,
				},
			},
		);

		expect(plan.prompt).toContain("Resolved operation envelope");
		expect(plan.prompt).toContain('"transform":"remove"');
		expect(plan.prompt).toContain('"blockIds":["block-1","block-2"]');
	});

	it("honors explicit structured-generation requests for ordinary prompts", () => {
		const editor = createEditor();
		const plan = buildPlaygroundRequestPlan(
			editor,
			"Create a table with names",
			TEST_PLANNER_CONFIG,
			"structured-generation",
		);

		expect(plan.mode).toBe("structured-generation");
		expect(plan.prompt).toBe("Create a table with names");
		expect(plan.useTools).toBe(false);
		expect(plan.contextFormat).toBe("none");
	});

	it("increases autocomplete output tokens for paragraph continuations", () => {
		const editor = createEditor();
		const prompt = [
			'prefix="Hey there, how are you?"',
			"cursor_here=true",
			'suffix=""',
			"[continuation]",
			"depth=1",
			"target_scope=finish-paragraph",
			"[provider:block-shape]",
			"block_type=paragraph",
		].join("\n");
		const plan = buildPlaygroundRequestPlan(
			editor,
			prompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("inline-autocomplete");
		expect(plan.maxOutputTokens).toBe(256);
	});

	it("increases autocomplete output tokens further for cross-paragraph continuations", () => {
		const editor = createEditor();
		const prompt = [
			'prefix="Hey there, how are you?"',
			"cursor_here=true",
			'suffix=""',
			"[continuation]",
			"depth=2",
			"target_scope=continue-across-paragraphs",
			"[provider:block-shape]",
			"block_type=paragraph",
		].join("\n");
		const plan = buildPlaygroundRequestPlan(
			editor,
			prompt,
			TEST_PLANNER_CONFIG,
		);

		expect(plan.mode).toBe("inline-autocomplete");
		expect(plan.maxOutputTokens).toBe(640);
	});
});
