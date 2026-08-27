import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../stream";
import { toolsExtension } from "@input/pen-tools";
import { aiExtension, getAIController } from "../index";
import { defaultSchema } from "@input/pen-schema";

describe("aiExtension: follow-up undo and block materialization", () => {
	it("restores the previous accepted story when undoing a kept follow-up rewrite", async () => {
		let streamCount = 0;
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				toolsExtension(),
				aiExtension({
					contentFormat: {
						blockGeneration: "markdown",
					},
					model: {
						async *stream(options) {
							streamCount += 1;
							yield {
								type: "replace-final" as const,
								operation: options.operation!,
								text:
									streamCount === 1
										? "# The Lighthouse Keeper's Last Signal\n\nA lighthouse story."
										: "# The Cat Keeper's Last Purr\n\nA cat story.",
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});

		const controller = getAIController(editor)!;
		const session = controller.startSession({
			surface: "bottom-chat",
			target: "document",
		});

		await controller.runSessionPrompt(session.id, "Write a story", {
			target: "document",
		});
		const firstTurnId =
			controller.getSessions().find((item) => item.id === session.id)
				?.turns[0]?.id ?? null;
		expect(firstTurnId).toBeTruthy();
		expect(controller.acceptSessionTurn(session.id, firstTurnId!)).toBe(
			true,
		);

		await controller.runSessionPrompt(
			session.id,
			"Actually make it about cats",
			{
				target: "document",
			},
		);
		const secondTurnId =
			controller.getSessions().find((item) => item.id === session.id)
				?.turns[1]?.id ?? null;
		expect(secondTurnId).toBeTruthy();
		expect(controller.acceptSessionTurn(session.id, secondTurnId!)).toBe(
			true,
		);

		expect(editor.undoManager.undo()).toBe(true);

		const visibleBlockTextsAfterUndo = editor.documentState.blockOrder
			.map(
				(id) =>
					editor.getBlock(id)?.textContent({ resolved: true }) ?? "",
			)
			.filter((text) => text.trim().length > 0);
		expect(visibleBlockTextsAfterUndo).toEqual([
			"The Lighthouse Keeper's Last Signal",
			"A lighthouse story.",
		]);
	});

	it("trims leading blank lines when bottom-chat writes into an empty block", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				toolsExtension(),
				aiExtension({
					contentFormat: {
						blockGeneration: "markdown",
					},
					model: {
						async *stream(options) {
							yield {
								type: "replace-final" as const,
								operation: options.operation!,
								text: "\n\nOnce upon a time",
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const controller = getAIController(editor)!;
		const session = controller.startSession({
			surface: "bottom-chat",
			target: "document",
		});

		const generation = await controller.runSessionPrompt(
			session.id,
			"Write a short story",
			{ target: "document" },
		);

		const visibleBlockTexts = editor.documentState.blockOrder
			.map(
				(id) =>
					editor.getBlock(id)?.textContent({ resolved: true }) ?? "",
			)
			.filter((text) => text.trim().length > 0);

		expect(generation.status).toBe("complete");
		expect(visibleBlockTexts).toEqual(["Once upon a time"]);
	});

	it("materializes bottom-chat paragraphs as separate blocks for empty targets", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				toolsExtension(),
				aiExtension({
					contentFormat: {
						blockGeneration: "markdown",
					},
					model: {
						async *stream(options) {
							yield {
								type: "replace-final" as const,
								operation: options.operation!,
								text: "First paragraph.\n\nSecond paragraph.",
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const controller = getAIController(editor)!;
		const session = controller.startSession({
			surface: "bottom-chat",
			target: "document",
		});

		const generation = await controller.runSessionPrompt(
			session.id,
			"Write two paragraphs",
			{ target: "document" },
		);

		const visibleBlockTexts = editor.documentState.blockOrder
			.map(
				(id) =>
					editor.getBlock(id)?.textContent({ resolved: true }) ?? "",
			)
			.filter((text) => text.trim().length > 0);

		expect(generation.status).toBe("complete");
		expect(visibleBlockTexts).toEqual([
			"First paragraph.",
			"Second paragraph.",
		]);
	});
});
