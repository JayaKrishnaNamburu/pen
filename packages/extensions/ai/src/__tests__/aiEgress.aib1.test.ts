import { describe, expect, it } from "vitest";
import { aiEgressFacet, createEditor, defineExtension } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import {
	AI_EGRESS_INVENTORY_CODE,
	AI_FEATURE_CONTENT,
	AI_REQUEST_REFUSED_CODE,
	aiEgressExtension,
	aiExtension,
	filterAIRequest,
	getAIController,
	runAgenticLoop,
	streamThroughEgress,
} from "../index";
import { excerptKindsOf } from "../egress";
import { defaultSchema } from "@input/pen-schema-default";
import { createModelDouble } from "@input/pen-test";
import type {
	AIRequestContext,
	DiagnosticEvent,
	ModelAdapter,
} from "@input/pen-types";

import { scriptedModel } from "./extension.testUtils";

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
	const items: T[] = [];
	for await (const item of iterable) {
		items.push(item);
	}
	return items;
}

function contextFor(
	feature: AIRequestContext["feature"],
	overrides: Partial<AIRequestContext> = {},
): AIRequestContext {
	return {
		feature,
		messages: [{ role: "user", content: "Continue SECRET target" }],
		documentExcerpts: [
			{
				blockId: "block-1",
				kind: "target",
				text: "SECRET target",
			},
			{
				blockId: "block-2",
				kind: feature === "agentic-step" ? "tool-result" : "context",
				text: "SECRET context",
			},
		],
		tools: [],
		...overrides,
	};
}

function assertDeclaration(recorded: AIRequestContext): void {
	const allowed = new Set(excerptKindsOf(recorded.feature));
	for (const excerpt of recorded.documentExcerpts) {
		expect(allowed.has(excerpt.kind)).toBe(true);
	}
	if (!AI_FEATURE_CONTENT[recorded.feature].includesToolResults) {
		expect(
			recorded.documentExcerpts.some(
				(excerpt) => excerpt.kind === "tool-result",
			),
		).toBe(false);
	}
}

function redactSecret(context: AIRequestContext): AIRequestContext {
	const redact = (value: string) => value.replace(/SECRET/g, "[redacted]");
	return {
		...context,
		documentExcerpts: context.documentExcerpts.map((excerpt) => ({
			...excerpt,
			text: redact(excerpt.text),
		})),
		messages: context.messages.map((message) => ({
			...message,
			content:
				typeof message.content === "string"
					? redact(message.content)
					: message.content,
		})),
	};
}

function countingAdapter(inner: ModelAdapter): ModelAdapter & {
	calls: number;
} {
	const adapter = {
		calls: 0,
		stream(options: Parameters<ModelAdapter["stream"]>[0]) {
			adapter.calls += 1;
			return inner.stream(options);
		},
	};
	return adapter;
}

describe("AIB1 pen.aiEgress", () => {
	it.each([
		"generation",
		"suggestions",
		"autocomplete",
		"agentic-step",
	] as const)(
		"AIB1: %s context matches the feature declaration",
		async (feature) => {
			const editor = createEditor({ schema: defaultSchema });
			const double = createModelDouble({
				responses: [{ text: "ok" }],
			});
			const request = contextFor(feature);
			await collect(streamThroughEgress(editor, double, request));
			expect(double.requests).toHaveLength(1);
			expect(double.requests[0]?.feature).toBe(feature);
			assertDeclaration(double.requests[0]!);
		},
	);

	it.each([
		"generation",
		"suggestions",
		"autocomplete",
		"agentic-step",
	] as const)(
		"AIB1: a redacting facet changes what %s sends to the adapter",
		async (feature) => {
			const double = createModelDouble({
				responses: [{ text: "ok" }],
			});
			const editor = createEditor({
				schema: defaultSchema,
				extensions: [aiEgressExtension(redactSecret)],
			});
			await collect(
				streamThroughEgress(editor, double, contextFor(feature)),
			);
			expect(
				double.requests[0]?.documentExcerpts.map(
					(excerpt) => excerpt.text,
				),
			).toEqual(["[redacted] target", "[redacted] context"]);
			expect(double.requests[0]?.messages[0]?.content).toBe(
				"Continue [redacted] target",
			);
		},
	);

	it.each([
		"generation",
		"suggestions",
		"autocomplete",
		"agentic-step",
	] as const)(
		"AIB1: a refusing facet produces no %s adapter call and no thrown error",
		async (feature) => {
			const double = createModelDouble({
				responses: [{ text: "should-not-run" }],
			});
			const model = countingAdapter(double);
			const diagnostics: DiagnosticEvent[] = [];
			const editor = createEditor({
				schema: defaultSchema,
				extensions: [aiEgressExtension(() => null)],
			});
			editor.on("diagnostic", (event) => {
				diagnostics.push(event as DiagnosticEvent);
			});

			await expect(
				collect(
					streamThroughEgress(editor, model, contextFor(feature)),
				),
			).resolves.toEqual([]);
			expect(model.calls).toBe(0);
			expect(double.requests).toEqual([]);
			expect(
				diagnostics.some(
					(event) => event.code === AI_REQUEST_REFUSED_CODE,
				),
			).toBe(true);
		},
	);

	it("AIB1: generation via runPrompt records a declared context", async () => {
		const double = scriptedModel(" world");
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({ model: double }),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "Hello SECRET" }],
			{ origin: "user" },
		);

		const generation = await getAIController(editor)!.runPrompt(
			"Continue",
			{
				blockId,
			},
		);
		expect(generation.status).toBe("complete");
		expect(double.requests).toHaveLength(1);
		expect(double.requests[0]?.feature).toBe("generation");
		assertDeclaration(double.requests[0]!);
		expect(
			double.requests[0]?.documentExcerpts.some(
				(excerpt) =>
					excerpt.blockId === blockId && excerpt.kind === "target",
			),
		).toBe(true);
	});

	it("AIB1: a redacting facet changes generation excerpts that reach the adapter", async () => {
		const double = scriptedModel(" world");
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				defineExtension({
					name: "host-core-ai-egress",
					facets: [aiEgressFacet.of(redactSecret)],
				}),
				aiExtension({ model: double }),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "Hello SECRET" }],
			{ origin: "user" },
		);

		await getAIController(editor)!.runPrompt("Continue", { blockId });
		const target = double.requests[0]?.documentExcerpts.find(
			(excerpt) => excerpt.kind === "target",
		);
		expect(target?.text).toContain("[redacted]");
		expect(target?.text).not.toContain("SECRET");
	});

	it("AIB1: a refusing facet lets runPrompt finish with no adapter call", async () => {
		const double = scriptedModel("should-not-run");
		const model = countingAdapter(double);
		const diagnostics: DiagnosticEvent[] = [];
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				defineExtension({
					name: "host-core-ai-egress",
					facets: [aiEgressFacet.of(() => null)],
				}),
				aiExtension({ model }),
			],
		});
		editor.on("diagnostic", (event) => {
			diagnostics.push(event as DiagnosticEvent);
		});
		const blockId = editor.firstBlock()!.id;

		await expect(
			getAIController(editor)!.runPrompt("Continue", { blockId }),
		).resolves.toMatchObject({ status: "complete" });
		expect(model.calls).toBe(0);
		expect(double.requests).toEqual([]);
		expect(
			diagnostics.some((event) => event.code === AI_REQUEST_REFUSED_CODE),
		).toBe(true);
	});

	it("AIB1: agentic-step records tool-result excerpts and inventory without text", async () => {
		const double = createModelDouble({
			responses: [{ text: "ok" }],
		});
		const diagnostics: DiagnosticEvent[] = [];
		const editor = createEditor({ schema: defaultSchema });
		editor.on("diagnostic", (event) => {
			diagnostics.push(event as DiagnosticEvent);
		});

		await collect(
			streamThroughEgress(
				editor,
				double,
				contextFor("agentic-step", {
					documentExcerpts: [
						{
							blockId: "block-1",
							kind: "target",
							text: "visible target",
						},
						{
							blockId: "block-1",
							kind: "tool-result",
							text: "SECRET tool output",
						},
					],
				}),
			),
		);

		expect(double.requests[0]?.feature).toBe("agentic-step");
		assertDeclaration(double.requests[0]!);
		const inventory = diagnostics.find(
			(event) => event.code === AI_EGRESS_INVENTORY_CODE,
		);
		expect(inventory).toMatchObject({
			feature: "agentic-step",
			excerpts: [
				{ blockId: "block-1", kind: "target" },
				{ blockId: "block-1", kind: "tool-result" },
			],
		});
		expect(JSON.stringify(inventory)).not.toContain("SECRET");
		expect(JSON.stringify(inventory)).not.toContain("visible target");
	});

	it("AIB1: runAgenticLoop refuses without throwing when the facet returns null", async () => {
		const double = createModelDouble({
			responses: [{ text: "should-not-run" }],
		});
		const model = countingAdapter(double);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiEgressExtension(() => null),
				aiExtension(),
			],
		});
		const blockId = editor.firstBlock()!.id;

		await expect(
			runAgenticLoop({
				model,
				editor,
				toolRuntime: {
					registerTool() {},
					unregisterTool() {},
					listTools: () => [],
					getTool: () => null,
					executeTool: async () => null,
				},
				prompt: "Continue",
				blockId,
				feature: "agentic-step",
			}),
		).resolves.toMatchObject({ status: "complete" });
		expect(model.calls).toBe(0);
		expect(double.requests).toEqual([]);
	});

	it("AIB1: filterAIRequest is a no-throw refuse", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [aiEgressExtension(() => null)],
		});
		expect(filterAIRequest(editor, contextFor("generation"))).toBeNull();
	});
});
