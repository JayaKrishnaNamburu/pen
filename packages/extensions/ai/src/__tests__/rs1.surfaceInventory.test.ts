import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { Decoration, Editor } from "@input/pen-types";
import {
	REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES,
	REVIEW_SURFACE_CLASSES,
} from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";
import { toolsExtension } from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { deltaStreamExtension } from "../stream";
import { aiExtension, getAIController } from "../index";
import { createDeferred } from "./extension.testUtils";

/**
 * RS1: three surfaces, three jobs, no fourth.
 *
 * Review-lane inventory (GATE 2.6). Each lane that can put a proposed edit on
 * screen is driven headlessly, and every class the resulting decorations carry
 * has to name itself as one of the three surfaces. A fourth presentation — a
 * new class nobody declared, or a decoration kind outside the two the surfaces
 * use — fails here rather than being discovered by a host.
 *
 * The vocabulary is imported from the module RS4 makes the source of truth
 * (`spec/rules/ai.md` RS1, RS4).
 */

/** (c) the review surface — proposed edits, in flight and staged. */
const REVIEW_SURFACE_VOCABULARY: readonly string[] = [
	...Object.values(REVIEW_SURFACE_CLASSES),
	...Object.values(REVIEW_SURFACE_BLOCK_SUGGESTION_CLASSES),
];

/** (b) the autocomplete ghost — a keystroke-accepted completion, not an edit. */
const GHOST_VOCABULARY: readonly string[] = ["pen-ephemeral-suggestion"];

/**
 * (a) the visible stream carries no class of its own: it is the generation
 * zone's block attributes on a block the user is already watching.
 */
const DECLARED_SURFACE_CLASSES = new Set<string>([
	...REVIEW_SURFACE_VOCABULARY,
	...GHOST_VOCABULARY,
]);

/** The decoration kinds the three surfaces are expressed in. */
const DECLARED_DECORATION_TYPES = new Set(["inline", "block"]);

describe("RS1: every lane resolves to one of the three surfaces", () => {
	it("RS1: a staged selection rewrite yields only declared surfaces", async () => {
		const editor = createTestEditor([
			{ type: "text-delta" as const, delta: "Rewritten" },
			{ type: "done" as const },
		]);
		seedTwoBlocks(editor);
		editor.selectTextRange(
			{ blockId: editor.firstBlock()!.id, offset: 0 },
			{ blockId: editor.firstBlock()!.id, offset: 5 },
		);

		const controller = getAIController(editor)!;
		await controller.runPrompt("Rewrite it", { target: "selection" });

		expectOnlyDeclaredSurfaces(editor);
		editor.destroy();
	});

	it("RS1: a mid-flight selection rewrite yields only declared surfaces", async () => {
		const release = createDeferred();
		const editor = createTestEditor([
			{ type: "text-delta" as const, delta: "Rewritten" },
			release,
			{ type: "done" as const },
		]);
		seedTwoBlocks(editor);
		// A selection spanning blocks cannot stream as an incremental splice,
		// so this is the lane that used to borrow the ghost overlay.
		editor.selectTextRange(
			{ blockId: editor.firstBlock()!.id, offset: 2 },
			{ blockId: "b2", offset: 3 },
		);

		const controller = getAIController(editor)!;
		const generationPromise = controller.runPrompt("Rewrite it", {
			target: "selection",
		});
		await settle();

		expectOnlyDeclaredSurfaces(editor);

		release.resolve();
		await generationPromise;
		expectOnlyDeclaredSurfaces(editor);
		editor.destroy();
	});

	it("RS1: a markdown block generation yields only declared surfaces, in flight and staged", async () => {
		const release = createDeferred();
		const editor = createTestEditor(
			[
				{ type: "text-delta" as const, delta: "## Title\n\n- one" },
				release,
				{ type: "text-delta" as const, delta: "\n- two" },
				{ type: "done" as const },
			],
			{ blockGeneration: "markdown", selectionRewrite: "text" },
		);

		const controller = getAIController(editor)!;
		const session = controller.startSession({
			surface: "bottom-chat",
			target: "document",
		});
		const generationPromise = controller.runSessionPrompt(
			session.id,
			"Write a list",
			{ target: "document" },
		);
		await settle();

		expectOnlyDeclaredSurfaces(editor);

		release.resolve();
		await generationPromise;
		expectOnlyDeclaredSurfaces(editor);
		editor.destroy();
	});
});

function expectOnlyDeclaredSurfaces(editor: Editor): void {
	const decorations = editor.getDecorations()
		.decorations as readonly Decoration[];

	const observedTypes = [...new Set(decorations.map((d) => d.type))].sort();
	for (const type of observedTypes) {
		expect(
			DECLARED_DECORATION_TYPES.has(type),
			`decoration kind "${type}" is not one of the three surfaces`,
		).toBe(true);
	}

	const observedClasses = new Set<string>();
	for (const decoration of decorations) {
		if (decoration.type !== "inline" && decoration.type !== "block") {
			continue;
		}
		const value = decoration.attributes.class;
		if (typeof value !== "string") continue;
		for (const token of value.split(/\s+/).filter(Boolean)) {
			observedClasses.add(token);
		}
	}

	// A closed-set check over an empty set passes without proving anything, so
	// the inventory insists the lane actually put something on a surface.
	expect(
		observedClasses.size,
		"lane rendered no surface at all, so this inventory proved nothing",
	).toBeGreaterThan(0);

	for (const token of [...observedClasses].sort()) {
		expect(
			DECLARED_SURFACE_CLASSES.has(token),
			`class "${token}" is a fourth surface: not declared by the review vocabulary or the ghost`,
		).toBe(true);
	}
}

type Frame =
	| { type: "text-delta"; delta: string }
	| { type: "done" }
	| ReturnType<typeof createDeferred>;

function createTestEditor(
	frames: readonly Frame[],
	contentFormat?: { blockGeneration: "markdown"; selectionRewrite: "text" },
): Editor {
	return createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			toolsExtension(),
			aiExtension({
				...(contentFormat ? { contentFormat } : {}),
				model: {
					async *stream() {
						for (const frame of frames) {
							if ("promise" in frame) {
								await frame.promise;
								continue;
							}
							yield frame;
						}
					},
				},
			}),
		],
	});
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
