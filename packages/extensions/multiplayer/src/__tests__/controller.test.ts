import { createEditor } from "@pen/core";
import { describe, expect, it, vi } from "vitest";
import { MultiplayerControllerImpl } from "../controller";
import { AuthorLedger } from "../presence/authorLedger";
import { ClientIdentityMap } from "../presence/identityMap";
import type { MultiplayerAwarenessState } from "../types";

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
});
