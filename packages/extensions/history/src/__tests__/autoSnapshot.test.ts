import { createEditor } from "@pen/core";
import { createDocumentSession } from "@pen/core";
import { yjsAdapter } from "@pen/crdt-yjs";
import type { PenPersistence, VersionEntry, VersionMetadata } from "@pen/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { getHistoryController, historyExtension } from "../index";

describe("AutoSnapshotScheduler", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("creates a session-start snapshot when enabled", async () => {
		const persistence = new MemoryPersistence();
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: {
						onSessionStart: true,
						onAIGeneration: false,
					},
				}),
			],
		});

		await flushMicrotasks();

		expect((await getHistoryController(editor)!.listSnapshots())).toHaveLength(1);
		expect(persistence.entries[0]?.metadata.trigger).toBe("auto");
		expect(persistence.entries[0]?.metadata.label).toBe("Session start");
	});

	it("creates an operation-threshold snapshot after document commits", async () => {
		const persistence = new MemoryPersistence();
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: {
						onSessionStart: false,
						onAIGeneration: false,
						opThreshold: 1,
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		await flushMicrotasks();
		const beforeCount = persistence.entries.length;

		appendText(editor, blockId, "x");
		await flushMicrotasks();

		const snapshots = await getHistoryController(editor)!.listSnapshots();
		expect(snapshots.length).toBeGreaterThan(beforeCount);
		expect(persistence.entries.some((entry) => entry.metadata.trigger === "auto")).toBe(
			true,
		);
	});

	it("creates an AI-generation snapshot from diagnostics", async () => {
		const persistence = new MemoryPersistence();
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: {
						onSessionStart: false,
						onAIGeneration: true,
					},
				}),
			],
		});

		editor.internals.emit("diagnostic", {
			code: "GENERATION_COMPLETE",
			level: "info",
			source: "ai",
			message: "Generation complete",
		});
		await flushMicrotasks();

		expect((await getHistoryController(editor)!.listSnapshots())).toHaveLength(1);
		expect(persistence.entries[0]?.metadata.trigger).toBe("ai-generation");
		expect(persistence.entries[0]?.metadata.label).toBe("Pre-AI generation");
	});

	it("creates interval snapshots", async () => {
		vi.useFakeTimers();
		const persistence = new MemoryPersistence();
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: {
						onSessionStart: false,
						onAIGeneration: false,
						intervalMs: 1_000,
					},
				}),
			],
		});

		vi.advanceTimersByTime(1_000);
		await flushMicrotasks();

		expect((await getHistoryController(editor)!.listSnapshots())).toHaveLength(1);
	});

	it("does not duplicate session-start snapshots across editors on one session", async () => {
		const persistence = new MemoryPersistence();
		const documentSession = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const editorA = createEditor({
			documentSession,
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: {
						onSessionStart: true,
						onAIGeneration: false,
					},
				}),
			],
		});
		const editorB = createEditor({
			documentSession,
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: {
						onSessionStart: true,
						onAIGeneration: false,
					},
				}),
			],
		});

		await flushMicrotasks();

		expect((await getHistoryController(editorA)!.listSnapshots())).toHaveLength(1);
		expect(persistence.entries).toHaveLength(1);

		editorA.destroy();
		editorB.destroy();
		documentSession.destroy();
	});
});

class MemoryPersistence implements PenPersistence {
	readonly entries: StoredVersion[] = [];
	private nextId = 1;

	async loadDocument(): Promise<Uint8Array | null> {
		return null;
	}

	async saveSnapshot(): Promise<void> { }

	async appendUpdate(): Promise<void> { }

	async getUpdates(): Promise<Uint8Array[]> {
		return [];
	}

	async compact(): Promise<void> { }

	async saveVersionSnapshot(
		_docId: string,
		snapshot: Uint8Array,
		metadata: VersionMetadata,
	): Promise<void> {
		this.entries.push({
			id: `version-${this.nextId++}`,
			snapshot: new Uint8Array(snapshot),
			metadata,
			createdAt: metadata.timestamp,
		});
	}

	async listVersions(): Promise<VersionEntry[]> {
		return [...this.entries]
			.sort((left, right) => right.createdAt - left.createdAt)
			.map((entry) => ({
				id: entry.id,
				metadata: entry.metadata,
				createdAt: entry.createdAt,
			}));
	}

	async loadVersion(
		_docId: string,
		versionId: string,
	): Promise<{ state: Uint8Array; snapshot: Uint8Array }> {
		const entry = this.entries.find((candidate) => candidate.id === versionId);
		if (!entry) {
			throw new Error(`Missing version ${versionId}`);
		}
		return {
			state: new Uint8Array(entry.snapshot),
			snapshot: new Uint8Array(entry.snapshot),
		};
	}
}

interface StoredVersion {
	id: string;
	snapshot: Uint8Array;
	metadata: VersionMetadata;
	createdAt: number;
}

function appendText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
	text: string,
): void {
	const ydoc = editor.internals.adapter.raw<Y.Doc>(editor.internals.crdtDoc);
	const blockMap = ydoc.getMap("blocks").get(blockId) as Y.Map<unknown>;
	const content = blockMap.get("content") as Y.Text;
	ydoc.transact(() => {
		content.insert(content.length, text);
	}, "user");
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}
