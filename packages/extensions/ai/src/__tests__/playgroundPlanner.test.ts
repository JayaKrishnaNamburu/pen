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
	selectionSourceCharLimit: 12_000,
	selectionStopSentinel: "<pen:end>",
	selectionOutputTokenCap: 1_200,
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

		expect(plan.mode).toBe("structured-planner");
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

		expect(plan.mode).toBe("structured-planner");
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

		expect(plan.mode).toBe("structured-planner");
		expect(plan.prompt).toBe(prompt);
		expect(plan.useTools).toBe(false);
		expect(plan.contextFormat).toBe("none");
	});
});
