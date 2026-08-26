import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { Decoration, Editor } from "@input/pen-types";
import { REVIEW_SURFACE_CLASSES } from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { deltaStreamExtension } from "../stream";
import { aiExtension, getAIController } from "../index";
import type { AISession } from "../types";
import {
	type AIReviewPostureSession,
	type AIReviewPresentationState,
	resolveAIReviewPresentationState,
} from "../review/reviewPresentationState";
import { createDeferred } from "./extension.testUtils";

/**
 * RS3: posture is total, including the end of a session.
 *
 * Two claims. First, that the posture resolver maps each input to a pinned
 * posture, so a swapped return cannot hide inside a closed-set walk. Second,
 * that a turn ending with an edit neither applied nor staged does not report
 * success (`spec-v5/02-review-surface.md` RS3).
 */

describe("RS3: every reviewable state renders a defined posture", () => {
	it("RS3: the posture resolver maps each input to a pinned posture", () => {
		const inlineOpen = session("inline-edit", true);
		const inlineClosed = session("inline-edit", false);
		const bottomChat = session("bottom-chat", true);
		const streamingHere = {
			status: "streaming" as const,
			sessionId: "s1",
		};
		const streamingOther = {
			status: "streaming" as const,
			sessionId: "other",
		};
		const complete = {
			status: "complete" as const,
			sessionId: "s1",
		};
		const errored = { status: "error" as const, sessionId: "s1" };

		const cases: Array<{
			label: string;
			activeGeneration: {
				status: "streaming" | "complete" | "error";
				sessionId: string;
			} | null;
			activeSession: AIReviewPostureSession | null;
			hasSuggestions: boolean;
			expected: AIReviewPresentationState;
		}> = [
			{
				label: "no session",
				activeGeneration: streamingHere,
				activeSession: null,
				hasSuggestions: true,
				expected: "resolved",
			},
			{
				label: "composer closed",
				activeGeneration: streamingHere,
				activeSession: inlineClosed,
				hasSuggestions: true,
				expected: "resolved",
			},
			{
				label: "bottom-chat",
				activeGeneration: streamingHere,
				activeSession: bottomChat,
				hasSuggestions: true,
				expected: "resolved",
			},
			{
				label: "suggestions pending",
				activeGeneration: streamingHere,
				activeSession: inlineOpen,
				hasSuggestions: true,
				expected: "user-reviewing",
			},
			{
				label: "streaming this session",
				activeGeneration: streamingHere,
				activeSession: inlineOpen,
				hasSuggestions: false,
				expected: "ai-writing",
			},
			{
				label: "streaming other session",
				activeGeneration: streamingOther,
				activeSession: inlineOpen,
				hasSuggestions: false,
				expected: "user-input",
			},
			{
				label: "complete",
				activeGeneration: complete,
				activeSession: inlineOpen,
				hasSuggestions: false,
				expected: "user-input",
			},
			{
				label: "error",
				activeGeneration: errored,
				activeSession: inlineOpen,
				hasSuggestions: false,
				expected: "user-input",
			},
			{
				label: "idle composer",
				activeGeneration: null,
				activeSession: inlineOpen,
				hasSuggestions: false,
				expected: "user-input",
			},
		];

		for (const row of cases) {
			expect(
				resolveAIReviewPresentationState({
					activeGeneration: row.activeGeneration,
					activeSession: row.activeSession,
					hasSuggestions: row.hasSuggestions,
				}),
				row.label,
			).toBe(row.expected);
		}
	});

	it("RS3: in-flight, awaiting-review, and terminal each render their posture", async () => {
		const release = createDeferred();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: "Rewritten",
							};
							await release.promise;
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		seedTwoBlocks(editor);
		editor.selectTextRange(
			{ blockId: editor.firstBlock()!.id, offset: 2 },
			{ blockId: "b2", offset: 3 },
		);
		const controller = getAIController(editor)!;

		const generationPromise = controller.runPrompt("Rewrite it", {
			target: "selection",
		});
		await settle();

		// in-flight: the edit is on screen as preview text and nothing is written.
		expect(
			controller.getState().streamingReviewPreviews.length,
		).toBeGreaterThan(0);
		expect(reviewClasses(editor)).toContain(REVIEW_SURFACE_CLASSES.preview);

		release.resolve();
		await generationPromise;

		// awaiting review: staged decorations the user can accept or reject.
		const suggestions = controller.getSuggestions();
		expect(suggestions.length).toBeGreaterThan(0);
		expect(controller.getState().streamingReviewPreviews).toEqual([]);
		expect(reviewClasses(editor)).toContain(
			REVIEW_SURFACE_CLASSES.suggestionInsert,
		);

		// resolving, then terminal: accept applies and the posture resolves away,
		// leaving no review decoration behind.
		for (const suggestion of suggestions) {
			controller.acceptSuggestion(suggestion.id);
		}
		expect(controller.getSuggestions()).toEqual([]);
		expect(reviewClasses(editor)).toEqual([]);
		editor.destroy();
	});
});

describe("RS3: a turn that applies nothing does not report success", () => {
	it("RS3: a non-loop markdown block turn whose target vanishes does not report success", async () => {
		const release = createDeferred();
		const diagnostics: Array<{ code: string; level: string }> = [];
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					contentFormat: { blockGeneration: "markdown" },
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: "## Replacement\n\nBody text",
							};
							await release.promise;
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		editor.on("diagnostic", (event: unknown) => {
			const record = event as { code?: string; level?: string };
			if (record.code && record.level) {
				diagnostics.push({ code: record.code, level: record.level });
			}
		});
		const targetBlockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId: targetBlockId,
				from: 0,
				to: 0,
				insert: "Original",
			},
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		const controller = getAIController(editor)!;
		// A "continue" intent on a block target is the cursor-context lane, which
		// keeps the `markdown-full-replace` strategy instead of handing the edit
		// to the tool loop — the non-loop lane GATE 2.7 asks about.
		const generationPromise = controller.runPrompt(
			"Continue writing this section",
			{ target: "document" },
		);
		await settle();

		// The edit's target goes away while the model is still talking, so the
		// turn closes with text in hand and nowhere to put it. Read the target
		// off the live generation rather than assuming which block it picked.
		const streamingTargetId =
			controller.getState().activeGeneration?.blockId ?? targetBlockId;
		editor.apply([{ type: "delete-block", blockId: streamingTargetId }]);
		release.resolve();
		const generation = await generationPromise;

		// The turn produced text, staged nothing, and wrote nothing.
		expect(generation.text.trim().length).toBeGreaterThan(0);
		expect(controller.getSuggestions()).toEqual([]);
		expect(generation.mutationReceipt?.status).toBe("noop");
		expect(editor.documentState.blockOrder.length).toBe(1);

		// RS3's floor: the host is not told this succeeded. That is the part of
		// the obligation this lane meets today, and it is worth pinning because
		// the alternative — `complete` with a character count and no document
		// change — is indistinguishable from success.
		expect(generation.status).not.toBe("complete");
		expect(diagnostics.length).toBeGreaterThan(0);
		editor.destroy();
	});
});

function session(surface: AISession["surface"], composerIsOpen: boolean) {
	return {
		id: "s1",
		surface,
		contextualPrompt: { composer: { isOpen: composerIsOpen } },
	} as AISession;
}

function reviewClasses(editor: Editor): string[] {
	const tokens = new Set<string>();
	for (const decoration of editor.getDecorations()
		.decorations as readonly Decoration[]) {
		if (decoration.type !== "inline" && decoration.type !== "block") {
			continue;
		}
		const value = decoration.attributes.class;
		if (typeof value !== "string") continue;
		for (const token of value.split(/\s+/).filter(Boolean)) {
			tokens.add(token);
		}
	}
	return [...tokens].sort();
}

function seedTwoBlocks(editor: Editor): void {
	const firstBlockId = editor.firstBlock()!.id;
	editor.apply([
		{
			type: "insert-block",
			blockId: "b2",
			blockType: "paragraph",
			props: {},
			position: "last",
		},
		{
			type: "splice-text",
			blockId: firstBlockId,
			from: 0,
			to: 0,
			insert: "Hello",
		},
		{ type: "splice-text", blockId: "b2", from: 0, to: 0, insert: "World" },
	]);
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 80));
}
