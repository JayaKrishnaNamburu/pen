import { createEditor } from "@pen/core";
import { createTestDocument } from "@pen/test";
import { describe, expect, it } from "vitest";
import { getMultiplayerController, multiplayerExtension } from "../index";
import type { MultiplayerAwarenessState } from "../types";
import { MultiplayerControllerImpl } from "../controller";

describe("multiplayer decorations", () => {
	it("renders remote cursor decorations", () => {
		const { crdtDoc } = createTestDocument([
			{ id: "b1", type: "paragraph", content: "Hello" },
		]);
		const editor = createEditor({
			document: crdtDoc,
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		const controller = getMultiplayerController(editor) as MultiplayerControllerImpl;

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[
					editor.clientId,
					{
						user: { id: "u1", name: "Ada" },
					},
				],
				[
					77,
					{
						user: { id: "u2", name: "Babbage", color: "#abc123" },
						cursor: { blockId, offset: 2, clock: 10 },
					},
				],
			]),
		);
		editor.requestDecorationUpdate();

		const inlineDecorations = editor.getDecorations().inlineForBlock(blockId);

		expect(inlineDecorations).toContainEqual(
			expect.objectContaining({
				type: "inline",
				blockId,
				from: 2,
				to: 2,
				attributes: expect.objectContaining({
					class: "pen-multiplayer-cursor",
					"data-user-id": "u2",
					"data-user-name": "Babbage",
				}),
			}),
		);
	});

	it("renders cross-block remote selection decorations", () => {
		const { crdtDoc } = createTestDocument([
				{ id: "b1", type: "paragraph", content: "Hello" },
				{ id: "b2", type: "paragraph", content: "middle" },
				{ id: "b3", type: "paragraph", content: "world" },
			]);
		const editor = createEditor({
			document: crdtDoc,
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const controller = getMultiplayerController(editor) as MultiplayerControllerImpl;

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[
					editor.clientId,
					{
						user: { id: "u1", name: "Ada" },
					},
				],
				[
					77,
					{
						user: { id: "u2", name: "Babbage", color: "#abc123" },
						selection: {
							anchor: { blockId: "b1", offset: 2 },
							head: { blockId: "b3", offset: 3 },
							clock: 11,
						},
					},
				],
			]),
		);
		editor.requestDecorationUpdate();

		const decorations = editor.getDecorations();

		expect(decorations.inlineForBlock("b1")).toContainEqual(
			expect.objectContaining({
				from: 2,
				to: 5,
				attributes: expect.objectContaining({
					class: "pen-multiplayer-selection",
				}),
			}),
		);
		expect(decorations.inlineForBlock("b2")).toContainEqual(
			expect.objectContaining({
				from: 0,
				to: 6,
			}),
		);
		expect(decorations.inlineForBlock("b3")).toContainEqual(
			expect.objectContaining({
				from: 0,
				to: 3,
			}),
		);
	});

	it("handles reverse cross-block selections", () => {
		const { crdtDoc } = createTestDocument([
				{ id: "b1", type: "paragraph", content: "Hello" },
				{ id: "b2", type: "paragraph", content: "middle" },
				{ id: "b3", type: "paragraph", content: "world" },
			]);
		const editor = createEditor({
			document: crdtDoc,
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const controller = getMultiplayerController(editor) as MultiplayerControllerImpl;

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[
					editor.clientId,
					{
						user: { id: "u1", name: "Ada" },
					},
				],
				[
					77,
					{
						user: { id: "u2", name: "Babbage", color: "#abc123" },
						selection: {
							anchor: { blockId: "b3", offset: 4 },
							head: { blockId: "b1", offset: 1 },
							clock: 12,
						},
					},
				],
			]),
		);
		editor.requestDecorationUpdate();

		const decorations = editor.getDecorations();

		expect(decorations.inlineForBlock("b1")).toContainEqual(
			expect.objectContaining({
				from: 1,
				to: 5,
			}),
		);
		expect(decorations.inlineForBlock("b2")).toContainEqual(
			expect.objectContaining({
				from: 0,
				to: 6,
			}),
		);
		expect(decorations.inlineForBlock("b3")).toContainEqual(
			expect.objectContaining({
				from: 0,
				to: 4,
			}),
		);
	});

	it("renders remote block selection decorations", () => {
		const { crdtDoc } = createTestDocument([
			{ id: "b1", type: "paragraph", content: "Hello" },
			{ id: "b2", type: "paragraph", content: "world" },
		]);
		const editor = createEditor({
			document: crdtDoc,
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const controller = getMultiplayerController(editor) as MultiplayerControllerImpl;

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[
					editor.clientId,
					{
						user: { id: "u1", name: "Ada" },
					},
				],
				[
					77,
					{
						user: { id: "u2", name: "Babbage", color: "#abc123" },
						selection: {
							kind: "block",
							blockIds: ["b1", "b2"],
							clock: 13,
						},
					},
				],
			]),
		);
		editor.requestDecorationUpdate();

		const decorations = editor.getDecorations();

		expect(decorations.forBlock("b1")).toContainEqual(
			expect.objectContaining({
				type: "block",
				blockId: "b1",
				attributes: expect.objectContaining({
					class: "pen-multiplayer-block-selection",
					"data-user-name": "Babbage",
				}),
			}),
		);
		expect(decorations.forBlock("b2")).toContainEqual(
			expect.objectContaining({
				type: "block",
				blockId: "b2",
				attributes: expect.objectContaining({
					class: "pen-multiplayer-block-selection",
				}),
			}),
		);
	});
});
