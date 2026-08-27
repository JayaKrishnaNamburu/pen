import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	toolsExtension,
	getDocumentToolRuntime,
	resolveDocumentBlocks,
} from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import type { ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import type { GenerationTarget } from "../helpers";
import { aiExtension, getAIController } from "../index";
import { routeAIRequest, type RequestRouterDecision } from "../runtime/router";
import { renderTrackedBlockView } from "../runtime/viewHashes";
import { deltaStreamExtension } from "../stream";
import type { AIWorkingSetEnvelope } from "../types";

const PROMPT = "Make the heading a question.";

interface WorkingSetHost {
	_buildWorkingSet(
		toolRuntime: NonNullable<ReturnType<typeof getDocumentToolRuntime>>,
		route: RequestRouterDecision,
		target: GenerationTarget,
		blockId: string,
		prompt: string,
		scope?: "document" | "block",
	): Promise<AIWorkingSetEnvelope | null>;
	_validateWorkingSet(
		route: RequestRouterDecision,
		target: GenerationTarget,
		workingSet: AIWorkingSetEnvelope | null,
	): { valid: boolean; canRefresh: boolean; reason?: string };
}

function createChatEditor(model: ModelAdapter) {
	return createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			toolsExtension(),
			aiExtension({
				model,
				contentFormat: { blockGeneration: "markdown" },
				mutationPreference: "direct",
				allowedMutatingTools: ["edit_document"],
			}),
		],
	});
}

function seedDocument(editor: ReturnType<typeof createEditor>): {
	headingId: string;
	introId: string;
} {
	const headingId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "set-props",
				blockId: headingId,
				props: { type: "heading", level: 1 },
			},
			{
				type: "splice-text",
				blockId: headingId,
				from: 0,
				to: 0,
				insert: "Quarterly Report",
			},
			{
				type: "insert-block",
				blockId: "intro",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "intro",
				from: 0,
				to: 0,
				insert: "This report covers the third quarter.",
			},
		],
		{ origin: "system" },
	);
	return { headingId, introId: "intro" };
}

function renderedMarkdown(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): string {
	const snapshot = resolveDocumentBlocks(
		editor,
		{
			startBlockId: blockId,
			endBlockId: blockId,
		},
		"resolved",
	).find((block) => block.id === blockId);
	return snapshot?.markdown ?? "";
}

async function captureWorkingSet(
	editor: ReturnType<typeof createEditor>,
	prompt: string,
): Promise<{
	host: WorkingSetHost;
	route: RequestRouterDecision;
	target: GenerationTarget;
	workingSet: AIWorkingSetEnvelope;
}> {
	const host = getAIController(editor) as unknown as WorkingSetHost;
	const blockId = editor.firstBlock()!.id;
	const target: GenerationTarget = {
		type: "block",
		blockId,
		offset: 0,
	};
	const route = routeAIRequest({
		prompt,
		selection: editor.selection,
		blockType: editor.getBlock(blockId)?.type ?? null,
		blockCount: editor.blockCount(),
		suggestMode: false,
		target: "block",
		contentFormat: "markdown",
		mutationPreference: "direct",
	});
	const workingSet = await host._buildWorkingSet(
		getDocumentToolRuntime(editor)!,
		route,
		target,
		blockId,
		prompt,
		"document",
	);
	expect(workingSet).toBeTruthy();
	expect(workingSet!.viewHashes).toBeTruthy();
	return { host, route, target, workingSet: workingSet! };
}

describe("working-set view fingerprints", () => {
	it("EC7: a text change after the read is stale", async () => {
		const editor = createChatEditor({
			async *stream() {
				yield { type: "done" } as ModelStreamEvent;
			},
		});
		await editor.whenReady();
		const { introId } = seedDocument(editor);
		const { host, route, target, workingSet } = await captureWorkingSet(
			editor,
			PROMPT,
		);

		expect(workingSet.viewHashes?.[introId]).toBeTruthy();
		expect(workingSet.trackedBlockIds).toContain(introId);

		editor.apply(
			[
				{
					type: "splice-text",
					blockId: introId,
					from: 0,
					to: editor.getBlock(introId)!.textContent().length,
					insert: "The third quarter is over.",
				},
			],
			{ origin: "system" },
		);

		const validation = host._validateWorkingSet(route, target, workingSet);
		expect(validation.valid).toBe(false);
		expect(validation.reason).toBe("view-changed");

		editor.destroy();
	});

	it("EC7: a props-only change that leaves rendered markdown identical is not stale", async () => {
		const editor = createChatEditor({
			async *stream() {
				yield { type: "done" } as ModelStreamEvent;
			},
		});
		await editor.whenReady();
		const { introId } = seedDocument(editor);
		const { host, route, target, workingSet } = await captureWorkingSet(
			editor,
			PROMPT,
		);

		const markdownBefore = renderedMarkdown(editor, introId);
		const annotatedBefore = renderTrackedBlockView(
			editor,
			introId,
			"resolved",
		);
		const selectionBefore = editor.selection;
		expect(markdownBefore.length).toBeGreaterThan(0);

		editor.apply(
			[
				{
					type: "set-props",
					blockId: introId,
					props: { direction: "rtl" },
				},
			],
			{ origin: "system" },
		);
		editor.setSelection(selectionBefore);

		expect(editor.getBlock(introId)?.props.direction).toBe("rtl");
		expect(renderedMarkdown(editor, introId)).toBe(markdownBefore);
		expect(renderTrackedBlockView(editor, introId, "resolved")).toBe(
			annotatedBefore,
		);

		const validation = host._validateWorkingSet(route, target, workingSet);
		expect(validation.valid).toBe(true);

		editor.destroy();
	});

	it("EC8: recorded view hashes do not appear in the model request", async () => {
		let capturedRequest: { messages: unknown } | null = null;
		const editor = createChatEditor({
			async *stream(request) {
				capturedRequest = { messages: request.messages };
				yield { type: "done" } as ModelStreamEvent;
			},
		});
		await editor.whenReady();
		seedDocument(editor);

		const { workingSet } = await captureWorkingSet(editor, PROMPT);
		const recordedHashes = Object.values(workingSet.viewHashes ?? {});
		expect(recordedHashes.length).toBeGreaterThan(0);
		for (const hash of recordedHashes) {
			expect(hash.length).toBeGreaterThan(0);
		}

		await getAIController(editor)!.runPrompt(PROMPT, {
			target: "document",
		});
		expect(capturedRequest).toBeTruthy();

		const serialized = JSON.stringify(capturedRequest!.messages);
		for (const hash of recordedHashes) {
			expect(serialized).not.toContain(hash);
		}

		editor.destroy();
	});
});
