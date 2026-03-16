import { createDocumentSession, createEditor } from "@pen/core";
import { yjsAdapter } from "@pen/crdt-yjs";
import {
	AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
	type ConnectionState,
	type MultiplayerSession,
} from "@pen/types";
import { describe, expect, it } from "vitest";
import {
	getMultiplayerController,
	multiplayerExtension,
	MULTIPLAYER_CONTROLLER_SLOT,
} from "../index";

describe("multiplayerExtension", () => {
	it("registers the controller on the editor", () => {
		const editor = createEditor({
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});

		expect(editor.internals.getSlot(MULTIPLAYER_CONTROLLER_SLOT)).toBeTruthy();
		expect(getMultiplayerController(editor)).toBeTruthy();
	});

	it("assigns a deterministic color when the user does not provide one", () => {
		const firstEditor = createEditor({
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const secondEditor = createEditor({
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});

		expect(
			getMultiplayerController(firstEditor)?.getState().localUser.color,
		).toBe(
			getMultiplayerController(secondEditor)?.getState().localUser.color,
		);
		expect(
			getMultiplayerController(firstEditor)?.getState().localUser.color,
		).toBeTruthy();
	});

	it("preserves an explicit user color", () => {
		const editor = createEditor({
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada", color: "#123456" },
				}),
			],
		});

		expect(getMultiplayerController(editor)?.getState().localUser.color).toBe(
			"#123456",
		);
	});

	it("clears the controller slot on destroy", async () => {
		const editor = createEditor({
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});

		editor.destroy();
		await (
			editor.internals.getSlot<() => Promise<void>>(
				AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
			)?.() ?? Promise.resolve()
		);

		expect(editor.internals.getSlot(MULTIPLAYER_CONTROLLER_SLOT)).toBeFalsy();
	});

	it("publishes local text selection into awareness state", () => {
		const editor = createEditor({
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;

		editor.selectText(blockId, 0, 0);

		expect(editor.internals.awareness?.getLocalState()).toMatchObject({
			user: { id: "u1", name: "Ada" },
			cursor: { blockId, offset: 0 },
			selection: {
				anchor: { blockId, offset: 0 },
				head: { blockId, offset: 0 },
			},
		});
	});

	it("shares one awareness state across editors on the same document session", () => {
		const session = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const editorA = createEditor({
			documentSession: session,
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const editorB = createEditor({
			documentSession: session,
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const blockId = editorA.firstBlock()!.id;

		editorA.selectText(blockId, 0, 0);
		editorB.selectText(blockId, 0, 0);

		expect(editorA.internals.awareness).toBe(editorB.internals.awareness);
		expect(editorA.internals.awareness?.getStates().size).toBe(1);
		expect(getMultiplayerController(editorA)?.getPeers()).toEqual([]);
		expect(getMultiplayerController(editorB)?.getPeers()).toEqual([]);

		editorA.destroy();
		editorB.destroy();
		session.destroy();
	});

	it("clears local awareness when the last shared-session editor disconnects", async () => {
		const session = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const editor = createEditor({
			documentSession: session,
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
				}),
			],
		});
		const awareness = editor.internals.awareness;

		expect(awareness?.getLocalState()).toMatchObject({
			user: { id: "u1", name: "Ada" },
		});

		editor.destroy();
		await (
			editor.internals.getSlot<() => Promise<void>>(
				AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
			)?.() ?? Promise.resolve()
		);

		expect(awareness?.getLocalState()).toBeNull();

		session.destroy();
	});

	it("wires provider connection state through the controller", () => {
		const session = new FakeSession();
		const editor = createEditor({
			extensions: [
				multiplayerExtension({
					user: { id: "u1", name: "Ada" },
					session,
				}),
			],
		});
		const controller = getMultiplayerController(editor)!;

		expect(controller.getState().connectionState).toBe("connecting");

		session.setState("syncing");
		expect(controller.getState().connectionState).toBe("syncing");

		session.setState("connected");
		expect(controller.getState().connectionState).toBe("connected");
		expect(controller.getState().isConnected).toBe(true);
	});
});

class FakeSession implements MultiplayerSession {
	private readonly listeners = new Set<(state: ConnectionState) => void>();

	connectionState: ConnectionState = "disconnected";

	connect(): void {
		this.setState("connecting");
	}

	disconnect(): void {
		this.setState("disconnected");
	}

	destroy(): void {
		this.listeners.clear();
	}

	onStateChange(listener: (state: ConnectionState) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	setState(nextState: ConnectionState): void {
		this.connectionState = nextState;
		for (const listener of this.listeners) {
			listener(nextState);
		}
	}
}
