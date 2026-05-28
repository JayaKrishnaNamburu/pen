import { randomUUID } from "node:crypto";
import type { Editor } from "@pen/types";

export interface PlaygroundSession {
	id: string;
	editor: Editor;
	clientToServerBlockIds: Map<string, string>;
	createdAt: number;
	lastTouchedAt: number;
	lastSyncedAt: number | null;
	syncedRevision: number | null;
	syncedGeneration: number | null;
	activeRequestCount: number;
}

export interface PlaygroundSessionStoreOptions {
	createEditor: () => Editor;
	ttlMs: number;
	onExpire?: (session: PlaygroundSession) => void;
}

export class PlaygroundSessionStore {
	private readonly sessions = new Map<string, PlaygroundSession>();

	constructor(private readonly options: PlaygroundSessionStoreOptions) {}

	create(): PlaygroundSession {
		const now = Date.now();
		const session: PlaygroundSession = {
			id: randomUUID(),
			editor: this.options.createEditor(),
			clientToServerBlockIds: new Map(),
			createdAt: now,
			lastTouchedAt: now,
			lastSyncedAt: null,
			syncedRevision: null,
			syncedGeneration: null,
			activeRequestCount: 0,
		};
		this.sessions.set(session.id, session);
		return session;
	}

	get(sessionId: string | null | undefined): PlaygroundSession | null {
		if (!sessionId) {
			return null;
		}
		return this.sessions.get(sessionId) ?? null;
	}

	touch(session: PlaygroundSession): void {
		session.lastTouchedAt = Date.now();
	}

	cleanupIdle(): void {
		const now = Date.now();

		for (const session of this.sessions.values()) {
			if (session.activeRequestCount > 0) {
				continue;
			}

			if (now - session.lastTouchedAt < this.options.ttlMs) {
				continue;
			}

			session.editor.destroy();
			this.sessions.delete(session.id);
			this.options.onExpire?.(session);
		}
	}
}
