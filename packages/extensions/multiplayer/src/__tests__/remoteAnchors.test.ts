import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { createTestDocument, createTwoPeerHarness } from "@input/pen-test";
import type { DiagnosticEvent } from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";
import { describe, expect, it } from "vitest";

import { MultiplayerControllerImpl } from "../controller";
import { AuthorLedger } from "../presence/authorLedger";
import { ClientIdentityMap } from "../presence/identityMap";
import { multiplayerExtension } from "../index";
import type { MultiplayerAwarenessState } from "../types";
import {
	serializePoint,
	wireCursor,
	wireTextSelection,
} from "./presenceAnchors";

function createDocumentEditor(content = "Hello") {
	const { crdtDoc } = createTestDocument([
		{ id: "b1", type: "paragraph", content },
	]);
	return createEditor({ schema: defaultSchema, document: crdtDoc });
}

describe("remote awareness anchors", () => {
	it("between-update correctness for in-block edits: a remote caret stays put while local edits land", () => {
		const editor = createDocumentEditor();
		const controller = new MultiplayerControllerImpl({
			editor,
			config: { user: { id: "u1", name: "Ada" } },
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[editor.clientId, { user: { id: "u1", name: "Ada" } }],
				[
					77,
					{
						user: { id: "u2", name: "Babbage", color: "#abc123" },
						cursor: wireCursor(editor, 3),
						selection: wireTextSelection(editor, 1, 3),
					},
				],
			]),
		);

		expect(controller.getRemoteCursors()[0]?.offset).toBe(3);

		editor.apply(
			[
				{
					type: "splice-text",
					blockId: "b1",
					from: 0,
					to: 0,
					insert: "xxx",
				},
			],
			{ origin: "user" },
		);

		expect(controller.getRemoteCursors()[0]).toMatchObject({
			blockId: "b1",
			offset: 6,
		});
		expect(controller.getRemoteSelections()[0]).toMatchObject({
			kind: "text",
			anchor: { blockId: "b1", offset: 4 },
			head: { blockId: "b1", offset: 6 },
		});

		controller.destroy();
		editor.destroy();
	});

	it("receiver convergence through a peer's undo: all receivers resolve identically", () => {
		const harness = createTwoPeerHarness({
			blocks: [{ id: "b1", type: "paragraph", content: "hello world" }],
			extensions: [
				undoExtension({ groupTimeout: 0 }),
				multiplayerExtension({ user: { id: "u1", name: "Ada" } }),
			],
		});

		const minted = harness.peerA.editor.anchors.create(
			{ blockId: "b1", offset: 6 },
			1,
		);
		expect(minted).not.toBeNull();
		const encoded = harness.peerA.editor.anchors.serialize(minted!);

		const onA = harness.peerA.editor.anchors.deserialize(encoded);
		const onB = harness.peerB.editor.anchors.deserialize(encoded);
		expect(onA).not.toBeNull();
		expect(onB).not.toBeNull();

		harness.peerA.editor.apply(
			[
				{
					type: "splice-text",
					blockId: "b1",
					from: 6,
					to: 6 + 5,
					insert: "",
				},
			],
			{ origin: "user" },
		);
		harness.exchange("a-then-b");
		expect(harness.peerA.editor.getBlock("b1").textContent()).toBe("hello ");
		expect(harness.peerB.editor.getBlock("b1").textContent()).toBe("hello ");

		expect(harness.peerA.editor.undoManager.undo()).toBe(true);
		harness.exchange("a-then-b");
		harness.assertConverged();
		expect(harness.peerA.editor.getBlock("b1").textContent()).toBe(
			"hello world",
		);
		expect(harness.peerB.editor.getBlock("b1").textContent()).toBe(
			"hello world",
		);

		const resolvedA = harness.peerA.editor.anchors.resolve(onA!);
		const resolvedB = harness.peerB.editor.anchors.resolve(onB!);
		// AN13: wire provenance converges at the restored-text boundary.
		expect(resolvedA).toEqual({ blockId: "b1", offset: 11 });
		expect(resolvedB).toEqual({ blockId: "b1", offset: 11 });
		expect(onA!.provenance).toBe("wire");
		expect(onB!.provenance).toBe("wire");

		harness.destroy();
	});

	it("hides a caret for oversize, malformed, and cross-doc anchors without throwing", () => {
		const editor = createDocumentEditor();
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		const controller = new MultiplayerControllerImpl({
			editor,
			config: { user: { id: "u1", name: "Ada" } },
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

		const oversize = "x".repeat(800);
		const malformed = "{not-json";
		const other = createDocumentEditor("other document");
		const crossDoc = serializePoint(other, "b1", 1);

		expect(() => {
			controller.handleAwarenessChange(
				new Map<number, MultiplayerAwarenessState>([
					[editor.clientId, { user: { id: "u1", name: "Ada" } }],
					[
						88,
						{
							user: { id: "u-bad", name: "Eve" },
							cursor: { anchor: oversize, clock: 1 },
						},
					],
				]),
			);
		}).not.toThrow();
		expect(controller.getRemoteCursors()).toEqual([]);

		expect(() => {
			controller.handleAwarenessChange(
				new Map<number, MultiplayerAwarenessState>([
					[editor.clientId, { user: { id: "u1", name: "Ada" } }],
					[
						89,
						{
							user: { id: "u-bad", name: "Eve" },
							cursor: { anchor: malformed, clock: 1 },
						},
					],
				]),
			);
		}).not.toThrow();
		expect(controller.getRemoteCursors()).toEqual([]);
		expect(
			diagnostics.some((event) => event.code === "anchor-decode"),
		).toBe(true);

		expect(() => {
			controller.handleAwarenessChange(
				new Map<number, MultiplayerAwarenessState>([
					[editor.clientId, { user: { id: "u1", name: "Ada" } }],
					[
						90,
						{
							user: { id: "u-bad", name: "Eve" },
							cursor: { anchor: crossDoc, clock: 1 },
						},
					],
				]),
			);
		}).not.toThrow();
		expect(controller.getRemoteCursors()).toEqual([]);

		controller.destroy();
		other.destroy();
		editor.destroy();
	});

	it("hides a caret when resolve returns null and keeps it hidden until a later frame", () => {
		const editor = createDocumentEditor();
		const controller = new MultiplayerControllerImpl({
			editor,
			config: { user: { id: "u1", name: "Ada" } },
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[editor.clientId, { user: { id: "u1", name: "Ada" } }],
				[
					77,
					{
						user: { id: "u2", name: "Babbage" },
						cursor: {
							anchor: '{"v":1,"b":"missing","a":1,"p":"AA=="}',
							clock: 10,
						},
					},
				],
			]),
		);
		expect(controller.getRemoteCursors()).toEqual([]);

		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[editor.clientId, { user: { id: "u1", name: "Ada" } }],
				[
					77,
					{
						user: { id: "u2", name: "Babbage" },
						cursor: wireCursor(editor, 2),
					},
				],
			]),
		);
		expect(controller.getRemoteCursors()[0]).toMatchObject({
			blockId: "b1",
			offset: 2,
		});

		controller.destroy();
		editor.destroy();
	});
});
