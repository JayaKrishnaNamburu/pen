import { createDocumentSession, createEditor } from "@pen/core";
import { yjsAdapter } from "@pen/crdt-yjs";
import type { PenPersistence, VersionEntry, VersionMetadata } from "@pen/types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
	getHistoryController,
	HISTORY_CONTROLLER_SLOT,
	historyExtension,
} from "../index";

describe("historyExtension", () => {
	it("registers the history controller on the editor", () => {
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence: new MemoryPersistence(),
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});

		expect(editor.internals.getSlot(HISTORY_CONTROLLER_SLOT)).toBeTruthy();
		expect(getHistoryController(editor)).toBeTruthy();
	});

	it("creates and lists snapshots", async () => {
		const persistence = new MemoryPersistence();
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		const controller = getHistoryController(editor)!;

		const created = await controller.createSnapshot("Manual checkpoint", "manual");
		const snapshots = await controller.listSnapshots();

		expect(created.metadata.label).toBe("Manual checkpoint");
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]?.id).toBe(created.id);
	});

	it("restores a previous snapshot for a standalone editor", async () => {
		const persistence = new MemoryPersistence();
		const editor = createEditor({
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		const controller = getHistoryController(editor)!;

		setBlockText(editor, blockId, "hello");
		const original = await controller.createSnapshot("Original", "manual");

		setBlockText(editor, blockId, "hello world");
		await controller.createSnapshot("Updated", "manual");

		await controller.restoreSnapshot(original.id);

		expect(readBlockText(editor, blockId)).toBe("hello");
		expect(persistence.entries).toHaveLength(3);
		expect(persistence.entries[2]?.metadata.label).toBe("Pre-restore auto-save");
		expect(getHistoryController(editor)).toBeTruthy();
	});

	it("restores a previous snapshot across all editors on the same document session", async () => {
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
					autoSnapshot: false,
				}),
			],
		});
		const editorB = createEditor({
			documentSession,
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		const blockId = editorA.firstBlock()!.id;
		const controller = getHistoryController(editorA)!;

		setBlockText(editorA, blockId, "hello");
		const original = await controller.createSnapshot("Original", "manual");

		setBlockText(editorA, blockId, "hello world");
		await controller.createSnapshot("Updated", "manual");

		await controller.restoreSnapshot(original.id);

		expect(readBlockText(editorA, blockId)).toBe("hello");
		expect(readBlockText(editorB, blockId)).toBe("hello");
		expect(editorA.internals.documentSession).toBe(documentSession);
		expect(editorB.internals.documentSession).toBe(documentSession);
		expect(editorA.documentScope.id).toBe(editorB.documentScope.id);
		expect(getHistoryController(editorA)).toBe(getHistoryController(editorB));
		expect(getHistoryController(editorA)).toBeTruthy();
		expect(getHistoryController(editorB)).toBeTruthy();

		editorA.destroy();
		editorB.destroy();
		documentSession.destroy();
	});

	it("shares one history controller per document scope", async () => {
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
					autoSnapshot: false,
				}),
			],
		});
		const editorB = createEditor({
			documentSession,
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});

		expect(editorA.internals.getSlot(HISTORY_CONTROLLER_SLOT)).toBe(
			editorB.internals.getSlot(HISTORY_CONTROLLER_SLOT),
		);
		expect(getHistoryController(editorA)).toBe(getHistoryController(editorB));

		editorA.destroy();
		editorB.destroy();
		documentSession.destroy();
	});

	it("restores nested subdocument editors when the root scope snapshot is restored", async () => {
		const persistence = new MemoryPersistence();
		const documentSession = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const rootEditor = createEditor({
			documentSession,
			extensions: [
				historyExtension({
					persistence,
					docId: "doc-1",
					autoSnapshot: false,
				}),
			],
		});
		rootEditor.apply([
			{
				type: "insert-block",
				blockId: "subdoc-block",
				blockType: "subdocument",
				props: { title: "Nested" },
				position: "last",
			},
		]);
		const childScope = documentSession.getScopeForBlock("subdoc-block", {
			scopeId: rootEditor.documentScope.id,
		});
		const childEditor = createEditor({
			documentSession,
			documentScopeId: childScope!.id,
		});
		const childBlockId = childEditor.firstBlock()!.id;
		const controller = getHistoryController(rootEditor)!;

		setBlockText(childEditor, childBlockId, "nested original");
		const original = await controller.createSnapshot("Original", "manual");

		setBlockText(childEditor, childBlockId, "nested updated");
		await controller.restoreSnapshot(original.id);
		const restoredChildScope = documentSession.getScopeForBlock("subdoc-block", {
			scopeId: rootEditor.documentScope.id,
		});
		const restoredChildEditor = createEditor({
			documentSession,
			documentScopeId: restoredChildScope!.id,
		});

		expect(restoredChildEditor.firstBlock()?.textContent()).toBe(
			"nested original",
		);
		expect(restoredChildEditor.documentScope.ownerBlockId).toBe("subdoc-block");
		expect(restoredChildEditor.documentScope.parentId).toBe(
			rootEditor.documentScope.id,
		);

		restoredChildEditor.destroy();
		childEditor.destroy();
		rootEditor.destroy();
		documentSession.destroy();
	});

});

class MemoryPersistence implements PenPersistence {
	readonly entries: StoredVersion[] = [];
	private nextId = 1;

	async loadDocument(): Promise<Uint8Array | null> {
		return null;
	}

	async saveSnapshot(): Promise<void> {}

	async appendUpdate(): Promise<void> {}

	async getUpdates(): Promise<Uint8Array[]> {
		return [];
	}

	async compact(): Promise<void> {}

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

	async listVersions(
		_docId: string,
		options?: { limit?: number; before?: string },
	): Promise<VersionEntry[]> {
		let entries = [...this.entries].sort(
			(left, right) => right.createdAt - left.createdAt,
		);

		if (options?.before) {
			const beforeIndex = entries.findIndex((entry) => entry.id === options.before);
			entries = beforeIndex === -1 ? entries : entries.slice(beforeIndex + 1);
		}

		if (typeof options?.limit === "number") {
			entries = entries.slice(0, options.limit);
		}

		return entries.map(toVersionEntry);
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

function toVersionEntry(entry: StoredVersion): VersionEntry {
	return {
		id: entry.id,
		metadata: entry.metadata,
		createdAt: entry.createdAt,
	};
}

function setBlockText(editor: ReturnType<typeof createEditor>, blockId: string, text: string): void {
	const ydoc = editor.internals.adapter.raw<Y.Doc>(editor.internals.crdtDoc);
	const blockMap = ydoc.getMap("blocks").get(blockId) as Y.Map<unknown>;
	const content = blockMap.get("content") as Y.Text;
	ydoc.transact(() => {
		content.delete(0, content.length);
		content.insert(0, text);
	}, "user");
}

function readBlockText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): string {
	const ydoc = editor.internals.adapter.raw<Y.Doc>(editor.internals.crdtDoc);
	const blockMap = ydoc.getMap("blocks").get(blockId) as Y.Map<unknown>;
	const content = blockMap.get("content") as Y.Text;
	return content.toString();
}
