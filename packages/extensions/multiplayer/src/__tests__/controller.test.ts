import { createEditor } from "@input/pen-core";
import { createTestDocument } from "@input/pen-test";
import { describe, expect, it, vi } from "vitest";
import { MultiplayerControllerImpl } from "../controller";
import { AuthorLedger } from "../presence/authorLedger";
import { ClientIdentityMap } from "../presence/identityMap";
import type { MultiplayerAwarenessState } from "../types";

function createDocumentEditor() {
	const { crdtDoc } = createTestDocument([
		{ id: "b1", type: "paragraph", content: "Hello" },
	]);
	return createEditor({ document: crdtDoc });
}

describe("MultiplayerControllerImpl", () => {
	it("starts disconnected with empty peer state", () => {
		const controller = new MultiplayerControllerImpl({
			editor: createEditor(),
			config: {
				user: { id: "u1", name: "Ada" },
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

		expect(controller.getState()).toEqual({
			connectionState: "disconnected",
			peers: [],
			localUser: { id: "u1", name: "Ada" },
			isConnected: false,
		});
		expect(controller.getPeers()).toEqual([]);
		expect(controller.getRemoteCursors()).toEqual([]);
		expect(controller.getRemoteSelections()).toEqual([]);
	});

	it("notifies subscribers when connection state changes", () => {
		const controller = new MultiplayerControllerImpl({
			editor: createEditor(),
			config: {
				user: { id: "u1", name: "Ada" },
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});
		const listener = vi.fn();
		const unsubscribe = controller.subscribe(listener);

		controller.connect();
		controller.disconnect();
		unsubscribe();
		controller.connect();

		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("returns a snapshot of current state", () => {
		const controller = new MultiplayerControllerImpl({
			editor: createEditor(),
			config: {
				user: { id: "u1", name: "Ada" },
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

		const snapshot = controller.snapshot();

		expect(snapshot.state.localUser).toEqual({ id: "u1", name: "Ada" });
		expect(snapshot.remoteCursors).toEqual([]);
		expect(snapshot.remoteSelections).toEqual([]);
	});

	it("derives remote peers, cursors, and selections from awareness state", () => {
		const editor = createDocumentEditor();
		const controller = new MultiplayerControllerImpl({
			editor,
			config: {
				user: { id: "u1", name: "Ada" },
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

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
						cursor: { blockId: "b1", offset: 3, clock: 10 },
						selection: {
							anchor: { blockId: "b1", offset: 1 },
							head: { blockId: "b1", offset: 3 },
							clock: 11,
						},
					},
				],
			]),
		);

		expect(controller.getRemoteCursors()).toEqual([
			{
				clientId: 77,
				user: { id: "u2", name: "Babbage", color: "#abc123" },
				blockId: "b1",
				offset: 3,
				clock: 10,
			},
		]);
		expect(controller.getRemoteSelections()).toEqual([
			{
				kind: "text",
				clientId: 77,
				user: { id: "u2", name: "Babbage", color: "#abc123" },
				anchor: { blockId: "b1", offset: 1 },
				head: { blockId: "b1", offset: 3 },
				clock: 11,
			},
		]);
		expect(controller.getPeers()).toEqual([
			{
				clientId: 77,
				user: { id: "u2", name: "Babbage", color: "#abc123" },
				cursor: {
					clientId: 77,
					user: { id: "u2", name: "Babbage", color: "#abc123" },
					blockId: "b1",
					offset: 3,
					clock: 10,
				},
				selection: {
					kind: "text",
					clientId: 77,
					user: { id: "u2", name: "Babbage", color: "#abc123" },
					anchor: { blockId: "b1", offset: 1 },
					head: { blockId: "b1", offset: 3 },
					clock: 11,
				},
				lastSeen: 11,
			},
		]);
	});

	it("retains author identities after peers leave awareness", () => {
		const editor = createEditor();
		const controller = new MultiplayerControllerImpl({
			editor,
			config: {
				user: { id: "u1", name: "Ada" },
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

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
					},
				],
			]),
		);
		controller.handleAwarenessChange(
			new Map<number, MultiplayerAwarenessState>([
				[
					editor.clientId,
					{
						user: { id: "u1", name: "Ada" },
					},
				],
			]),
		);

		expect(controller.getPeers()).toEqual([]);
		expect(controller.getAuthorLedger().resolve(77)).toEqual({
			id: "u2",
			name: "Babbage",
			color: "#abc123",
		});
	});

	it("maps stale remote carets through summaryLog.between", () => {
		const editor = createDocumentEditor();
		const recordedCommitId = editor.summaryLog.latest()?.commitId ?? 0;
		editor.apply(
			[{ type: "insert-text", blockId: "b1", offset: 0, text: "xxx" }],
			{ origin: { type: "collaborator" } },
		);

		const controller = new MultiplayerControllerImpl({
			editor,
			config: {
				user: { id: "u1", name: "Ada" },
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

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
						cursor: {
							blockId: "b1",
							offset: 3,
							clock: 10,
							commitId: recordedCommitId,
						},
						selection: {
							anchor: { blockId: "b1", offset: 1 },
							head: { blockId: "b1", offset: 3 },
							clock: 11,
							commitId: recordedCommitId,
						},
					},
				],
			]),
		);

		expect(controller.getRemoteCursors()).toEqual([
			{
				clientId: 77,
				user: { id: "u2", name: "Babbage", color: "#abc123" },
				blockId: "b1",
				offset: 6,
				clock: 10,
			},
		]);
		expect(controller.getRemoteSelections()).toEqual([
			{
				kind: "text",
				clientId: 77,
				user: { id: "u2", name: "Babbage", color: "#abc123" },
				anchor: { blockId: "b1", offset: 4 },
				head: { blockId: "b1", offset: 6 },
				clock: 11,
			},
		]);
	});

	it("returns the same snapshot references when mapping is a no-op", () => {
		const editor = createDocumentEditor();
		const controller = new MultiplayerControllerImpl({
			editor,
			config: {
				user: { id: "u1", name: "Ada" },
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap(),
		});

		expect(controller.getState()).toBe(controller.getState());
		expect(controller.getRemoteCursors()).toBe(controller.getRemoteCursors());
		expect(controller.getRemoteSelections()).toBe(
			controller.getRemoteSelections(),
		);

		const latestCommitId = editor.summaryLog.latest()?.commitId ?? 0;
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
						cursor: {
							blockId: "b1",
							offset: 3,
							clock: 10,
							commitId: latestCommitId,
						},
						selection: {
							anchor: { blockId: "b1", offset: 1 },
							head: { blockId: "b1", offset: 3 },
							clock: 11,
							commitId: latestCommitId,
						},
					},
				],
			]),
		);

		const cursors = controller.getRemoteCursors();
		const selections = controller.getRemoteSelections();
		const state = controller.getState();
		expect(controller.getRemoteCursors()).toBe(cursors);
		expect(controller.getRemoteSelections()).toBe(selections);
		expect(controller.getState()).toBe(state);
	});
});
