import type { ConnectionState } from "@pen/types";
import { describe, expect, it } from "vitest";

import {
	createYjsProviderSession,
	type YjsProviderAdapter,
} from "../index";

describe("createYjsProviderSession", () => {
	it("maps provider status changes into multiplayer connection state", () => {
		const provider = new FakeProvider();
		const session = createYjsProviderSession(provider);
		const states: ConnectionState[] = [];

		session.onStateChange((state) => {
			states.push(state);
		});

		session.connect();
		provider.emitStatus("connecting");
		provider.emitStatus("connected");
		provider.emitSync(true);
		session.disconnect();
		provider.emitStatus("disconnected");

		expect(states).toEqual([
			"connecting",
			"syncing",
			"connected",
			"disconnected",
		]);
		expect(provider.connectCalls).toBe(1);
		expect(provider.disconnectCalls).toBe(1);
	});

	it("treats connected as final when the provider has no sync event", () => {
		const provider = createProviderWithoutSync();
		const session = createYjsProviderSession(provider);
		const states: ConnectionState[] = [];

		session.onStateChange((state) => {
			states.push(state);
		});

		provider.emitStatus("connecting");
		provider.emitStatus("connected");

		expect(states).toEqual(["connecting", "connected"]);
		expect(session.connectionState).toBe("connected");
	});

	it("cleans up listeners and destroys the provider", () => {
		const provider = new FakeProvider();
		const session = createYjsProviderSession(provider);

		session.destroy();

		expect(provider.destroyCalls).toBe(1);
		expect(provider.statusListeners.size).toBe(0);
		expect(provider.syncListeners.size).toBe(0);
	});

	it("hydrates initial provider status immediately", () => {
		const provider = new FakeProvider({
			initialStatus: "connected",
			initialSynced: true,
		});

		const session = createYjsProviderSession(provider);

		expect(session.connectionState).toBe("connected");
	});
});

class FakeProvider {
	readonly statusListeners = new Set<
		(status: "disconnected" | "connecting" | "connected") => void
	>();
	readonly syncListeners = new Set<(isSynced: boolean) => void>();

	connectCalls = 0;
	disconnectCalls = 0;
	destroyCalls = 0;

	constructor(
		private readonly options: {
			initialStatus?: "disconnected" | "connecting" | "connected";
			initialSynced?: boolean;
		} = {},
	) { }

	connect(): void {
		this.connectCalls += 1;
	}

	disconnect(): void {
		this.disconnectCalls += 1;
	}

	destroy(): void {
		this.destroyCalls += 1;
	}

	getStatus(): "disconnected" | "connecting" | "connected" {
		return this.options.initialStatus ?? "disconnected";
	}

	getIsSynced(): boolean {
		return this.options.initialSynced ?? false;
	}

	onStatusChange(
		listener: (status: "disconnected" | "connecting" | "connected") => void,
	): () => void {
		this.statusListeners.add(listener);
		return () => {
			this.statusListeners.delete(listener);
		};
	}

	onSync(listener: (isSynced: boolean) => void): () => void {
		this.syncListeners.add(listener);
		return () => {
			this.syncListeners.delete(listener);
		};
	}

	emitStatus(status: "disconnected" | "connecting" | "connected"): void {
		for (const listener of this.statusListeners) {
			listener(status);
		}
	}

	emitSync(isSynced: boolean): void {
		for (const listener of this.syncListeners) {
			listener(isSynced);
		}
	}
}

function createProviderWithoutSync(): YjsProviderAdapter & {
	emitStatus(status: "disconnected" | "connecting" | "connected"): void;
} {
	const statusListeners = new Set<
		(status: "disconnected" | "connecting" | "connected") => void
	>();

	return {
		connect() { },
		disconnect() { },
		destroy() { },
		onStatusChange(listener) {
			statusListeners.add(listener);
			return () => {
				statusListeners.delete(listener);
			};
		},
		emitStatus(status) {
			for (const listener of statusListeners) {
				listener(status);
			}
		},
	};
}
