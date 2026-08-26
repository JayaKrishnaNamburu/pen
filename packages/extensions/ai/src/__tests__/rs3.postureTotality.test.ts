import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { Decoration, Editor } from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { deltaStreamExtension } from "../stream";
import { aiExtension, getAIController } from "../index";
import type { AISession, GenerationState } from "../types";
import {
	type AIReviewPresentationState,
	resolveAIReviewPresentationState,
} from "../review/reviewPresentationState";
import { createDeferred } from "./extension.testUtils";

/**
 * RS3: posture is total, including the end of a session.
 *
 * Two claims. First, that the posture resolver is total: no combination of
 * generation and session state falls through to nothing, so a reviewable edit
 * can never sit in a state the surface has no answer for. Second, that a turn
 * ending with an edit neither applied nor staged says so — a silent no-op is
 * the one outcome a host cannot distinguish from success
 * (`spec-v5/02-review-surface.md` RS3).
 */

const DEFINED_POSTURES = new Set<AIReviewPresentationState>([
	"user-input",
	"thinking",
	"ai-writing",
	"user-reviewing",
	"resolved",
]);

describe("RS3: every reviewable state renders a defined posture", () => {
	it("RS3: the posture resolver is total across generation and session state", () => {
		// The resolver reads three things; this walks their product rather than
		// sampling it, so a new branch that forgets to return fails here.
		const generations: Array<GenerationState | null> = [
			null,
			{ status: "streaming", sessionId: "s1" } as GenerationState,
			{ status: "complete", sessionId: "s1" } as GenerationState,
			{ status: "streaming", sessionId: "other" } as GenerationState,
			{ status: "error", sessionId: "s1" } as GenerationState,
		];
		const sessions: Array<AISession | null> = [
			null,
			session("inline-edit", true),
			session("inline-edit", false),
			session("bottom-chat", true),
		];

		let combinations = 0;
		for (const activeGeneration of generations) {
			for (const activeSession of sessions) {
				for (const hasSuggestions of [true, false]) {
					const posture = resolveAIReviewPresentationState({
						activeGeneration,
						activeSession,
						hasSuggestions,
					});
					expect(
						DEFINED_POSTURES.has(posture),
						`posture "${posture}" is not a defined posture`,
					).toBe(true);
					combinations += 1;
				}
			}
		}
		expect(combinations).toBe(40);
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
		expect(reviewClasses(editor)).toContain("pen-ai-review-preview");

		release.resolve();
		await generationPromise;

		// awaiting review: staged decorations the user can accept or reject.
		const suggestions = controller.getSuggestions();
		expect(suggestions.length).toBeGreaterThan(0);
		expect(controller.getState().streamingReviewPreviews).toEqual([]);
		expect(reviewClasses(editor)).toContain("pen-suggestion-insert");

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

describe("RS3: a turn that applies nothing reports it", () => {
	it("RS3: a non-loop markdown block turn whose target vanishes reports the unapplied edit", async () => {
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

function session(
	surface: AISession["surface"],
	composerIsOpen: boolean,
): AISession {
	// The resolver reads only the id, the surface, and whether the contextual
	// composer is open; a fuller row would not change what it decides.
	return {
		id: "s1",
		surface,
		contextualPrompt: { composer: { isOpen: composerIsOpen } },
	} as unknown as AISession;
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
