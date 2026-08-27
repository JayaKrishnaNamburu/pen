import { describe, expect, it } from "vitest";
import {
	aiEgressFacet,
	createEditor,
	defineExtension,
	streamThroughEgress,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { createModelDouble } from "@input/pen-test";
import type {
	AIRequestContext,
	AIRequestFilter,
	DiagnosticEvent,
	ModelAdapter,
} from "@input/pen-types";
import { AI_REQUEST_REFUSED_CODE } from "@input/pen-types";
import { streamThroughEgress as localStreamThroughEgress } from "../aiEgress";
import { analyzeSuggestionScope } from "../analyzer";
import type { BuiltSuggestionScope } from "../scopeBuilder";

const SECRET = "SECRET";

function aiEgressExtension(filter: AIRequestFilter) {
	return defineExtension({
		name: "test-ai-egress",
		facets: [aiEgressFacet.of(filter)],
	});
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

function redactSecret(context: AIRequestContext): AIRequestContext {
	const redact = (value: string) =>
		value.replace(new RegExp(SECRET, "g"), "[redacted]");
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

function assertSuggestionsDeclaration(recorded: AIRequestContext): void {
	expect(recorded.feature).toBe("suggestions");
	expect(recorded.tools).toEqual([]);
	for (const excerpt of recorded.documentExcerpts) {
		expect(["target", "context"]).toContain(excerpt.kind);
	}
	expect(
		recorded.documentExcerpts.some(
			(excerpt) => excerpt.kind === "selection",
		),
	).toBe(false);
	expect(
		recorded.documentExcerpts.some(
			(excerpt) => excerpt.kind === "tool-result",
		),
	).toBe(false);
}

function suggestionScope(blockId: string): BuiltSuggestionScope {
	return {
		scope: {
			id: "scope-1",
			blockId,
			blockType: "paragraph",
			text: `Target ${SECRET} sentence.`,
			from: 20,
			to: 44,
			hash: `${blockId}:target`,
			documentGeneration: 1,
		},
		contextBefore: `Intro ${SECRET} context. `,
		contextAfter: ` Trailing ${SECRET} after.`,
	};
}

describe("AIB1 suggestions live egress", () => {
	it("uses the core streamThroughEgress, not a local copy", () => {
		expect(localStreamThroughEgress).toBe(streamThroughEgress);
	});

	it("AIB1: a refusing facet blocks the suggestions analyzer path", async () => {
		const double = createModelDouble({
			responses: [
				{
					text: JSON.stringify({
						suggestions: [
							{
								kind: "spelling",
								title: "Spelling",
								originalText: "Ths",
								replacementText: "This",
							},
						],
					}),
				},
			],
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
		const blockId = editor.firstBlock()!.id;

		await expect(
			analyzeSuggestionScope({
				editor,
				scope: suggestionScope(blockId),
				config: { model },
			}),
		).resolves.toEqual({
			candidates: [],
			usage: {
				promptTokens: 0,
				completionTokens: 0,
			},
		});
		expect(model.calls).toBe(0);
		expect(double.requests).toEqual([]);
		expect(
			diagnostics.some(
				(event) =>
					event.code === AI_REQUEST_REFUSED_CODE &&
					event.feature === "suggestions",
			),
		).toBe(true);

		editor.destroy();
	});

	it("AIB1: a redacting facet changes the suggestions analyzer payload", async () => {
		const double = createModelDouble({
			responses: [
				{
					text: JSON.stringify({
						suggestions: [
							{
								kind: "spelling",
								title: "Spelling",
								originalText: "Ths",
								replacementText: "This",
							},
						],
					}),
				},
			],
		});
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [aiEgressExtension(redactSecret)],
		});
		const blockId = editor.firstBlock()!.id;
		const scope = suggestionScope(blockId);

		const result = await analyzeSuggestionScope({
			editor,
			scope,
			config: { model: double },
		});

		expect(result.candidates).toHaveLength(1);
		expect(double.requests).toHaveLength(1);
		const recorded = double.requests[0]!;
		assertSuggestionsDeclaration(recorded);
		expect(
			recorded.documentExcerpts.some(
				(excerpt) =>
					excerpt.blockId === blockId && excerpt.kind === "target",
			),
		).toBe(true);
		expect(
			recorded.documentExcerpts.filter(
				(excerpt) => excerpt.kind === "context",
			),
		).toHaveLength(2);
		const payload = JSON.stringify(recorded);
		expect(payload).toContain("[redacted]");
		expect(payload).not.toContain(SECRET);

		editor.destroy();
	});
});
