import {
	createEditor,
	runMigrations,
	type DocumentMigration,
} from "@input/pen-core";
import type { YjsCRDTDocument } from "@input/pen-crdt-yjs";
import { defaultSchema } from "@input/pen-schema-default";
import { createTwoPeerHarness } from "@input/pen-test";
import type { CommitEvent, Editor, OpOrigin } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { undoExtension } from "../undoExtension";

/**
 * Origin-shape contract between core, the Yjs adapter, and the undo manager.
 *
 * Core's apply pipeline tags the Y transaction with `toStructuredOrigin(origin)`.
 * For a string `"user"` that is a freshly allocated `{ type: "user" }` — not the
 * interned canonical token and not the string itself. Y.UndoManager captures
 * with identity `Set.has(transaction.origin)`. If the adapter only tracks the
 * interned object / type string, a user apply is silently not captured and
 * undo becomes a no-op on a changed document.
 *
 * Matching is the `.type` discriminant only. Extra fields, frozen objects,
 * and nested payloads must not change capture. A non-string `type` is not a
 * structured origin and must not be treated as `user`.
 *
 * These tests assert on the resulting document. They also cover write paths
 * other than `editor.apply`: `adapter.transact` (local) and `adapter.applyUpdate`
 * (remote). Collaborator and migration must stay uncaptured.
 */

function createEditorWithUndo() {
	return createEditor({
		schema: defaultSchema,
		extensions: [undoExtension({ groupTimeout: 0 })],
	});
}

function visibleText(editor: Editor, blockId?: string): string {
	const block = blockId ? editor.getBlock(blockId) : editor.firstBlock();
	return (block?.textContent() ?? "").replace(/\u200B/g, "");
}

function insertText(editor: Editor, text: string, origin: OpOrigin) {
	const blockId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "splice-text",
				blockId,
				from: editor.getBlock(blockId)!.length(),
				to: editor.getBlock(blockId)!.length(),
				insert: text,
			},
		],
		{ origin },
	);
	return blockId;
}

function insertTextMigration(id: string, text: string): DocumentMigration {
	return {
		id,
		run(editor) {
			const blockId = editor.firstBlock()!.id;
			editor.apply([
				{
					type: "splice-text",
					blockId,
					from: editor.getBlock(blockId)!.length(),
					to: editor.getBlock(blockId)!.length(),
					insert: text,
				},
			]);
		},
	};
}

describe("@input/pen-undo origin shape contract", () => {
	it("captures a string user origin so undo restores the document", () => {
		const editor = createEditorWithUndo();
		const prior = visibleText(editor);

		insertText(editor, "typed", "user");
		expect(visibleText(editor)).toBe("typed");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe(prior);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe(prior);

		editor.destroy();
	});

	it("captures a fresh structured user origin so undo restores the document", () => {
		const editor = createEditorWithUndo();
		const prior = visibleText(editor);
		const freshUserOrigin = { type: "user" as const };

		insertText(editor, "typed", freshUserOrigin);
		expect(visibleText(editor)).toBe("typed");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe(prior);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe(prior);

		editor.destroy();
	});

	it("captures a structured user origin that carries groupId and requestId", () => {
		const editor = createEditorWithUndo();
		const prior = visibleText(editor);

		insertText(editor, "one", {
			type: "user",
			groupId: "turn-1",
			requestId: "req-1",
		});
		insertText(editor, " two", {
			type: "user",
			groupId: "turn-1",
			requestId: "req-1",
		});
		expect(visibleText(editor)).toBe("one two");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe(prior);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe(prior);

		editor.destroy();
	});

	it("does not capture a collaborator origin: undo leaves the document", () => {
		const editor = createEditorWithUndo();

		insertText(editor, "remote", "collaborator");
		expect(visibleText(editor)).toBe("remote");

		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe("remote");

		editor.destroy();
	});

	it("COL1: peer B's user apply is collaborator on peer A and is not undone", () => {
		const harness = createTwoPeerHarness({
			blocks: [{ id: "b1", type: "paragraph", content: "Hello" }],
			extensions: [undoExtension({ groupTimeout: 0 })],
		});
		const remoteOrigins: string[] = [];
		harness.peerA.editor.on("commit", (event: CommitEvent) => {
			if (event.source === "remote") {
				remoteOrigins.push(event.origin.type);
			}
		});

		harness.peerB.editor.apply(
			[
				{
					type: "splice-text",
					blockId: "b1",
					from: 5,
				to: 5,
				insert: " from-b",
				},
			],
			{ origin: "user" },
		);
		harness.exchange("b-then-a");
		harness.assertConverged();
		expect(visibleText(harness.peerB.editor, "b1")).toBe("Hello from-b");
		expect(visibleText(harness.peerA.editor, "b1")).toBe("Hello from-b");
		expect(remoteOrigins.length).toBeGreaterThan(0);
		expect(remoteOrigins.every((type) => type === "collaborator")).toBe(
			true,
		);
		expect(remoteOrigins).not.toContain("user");

		expect(harness.peerA.editor.undoManager.undo()).toBe(false);
		expect(visibleText(harness.peerA.editor, "b1")).toBe("Hello from-b");

		harness.exchange("a-then-b");
		harness.assertConverged();
		expect(visibleText(harness.peerB.editor, "b1")).toBe("Hello from-b");

		harness.destroy();
	});

	it("DUR4: undoing a user edit after a migration leaves the migration in the document", () => {
		const editor = createEditorWithUndo();

		insertText(editor, "user", "user");
		const report = runMigrations(editor, [
			insertTextMigration("upgrade", "upgraded"),
		]);

		expect(report.applied).toEqual(["upgrade"]);
		expect(visibleText(editor)).toBe("userupgraded");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe("upgraded");
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe("upgraded");

		editor.destroy();
	});

	it("captures a structured user origin that carries an unexpected extra field", () => {
		const editor = createEditorWithUndo();
		const prior = visibleText(editor);
		const origin = {
			type: "user" as const,
			unexpected: "field",
			nested: { type: "collaborator" as const },
		};

		insertText(editor, "typed", origin as OpOrigin);
		expect(visibleText(editor)).toBe("typed");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe(prior);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe(prior);

		editor.destroy();
	});

	it("captures a frozen structured user origin so undo restores the document", () => {
		const editor = createEditorWithUndo();
		const prior = visibleText(editor);
		const frozen = Object.freeze({
			type: "user" as const,
			groupId: "frozen-1",
			requestId: "req-frozen",
		});

		insertText(editor, "typed", frozen);
		expect(visibleText(editor)).toBe("typed");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe(prior);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe(prior);

		editor.destroy();
	});

	it("does not capture a structured origin whose type is not a string", () => {
		const editor = createEditorWithUndo();
		insertText(editor, "typed", { type: 1 } as unknown as OpOrigin);
		expect(visibleText(editor)).toBe("typed");

		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe("typed");

		editor.destroy();
	});

	it("captures a fresh structured user origin arriving via adapter.transact", () => {
		const editor = createEditorWithUndo();
		const prior = visibleText(editor);
		const adapter = editor.internals.adapter;
		const doc = editor.internals.crdtDoc as YjsCRDTDocument;
		const blockId = editor.firstBlock()!.id;
		const content = doc.penDocument.blocks.get(blockId)?.get("content");
		if (!(content instanceof Y.Text)) {
			throw new Error(`block ${blockId} has no text`);
		}

		adapter.transact(
			doc,
			() => {
				content.insert(content.length, "typed");
			},
			{ type: "user" },
		);
		expect(visibleText(editor)).toBe("typed");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe(prior);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe(prior);

		editor.destroy();
	});

	it("captures a null-prototype structured user origin so undo restores the document", () => {
		const editor = createEditorWithUndo();
		const prior = visibleText(editor);
		const origin = Object.assign(Object.create(null) as { type: "user" }, {
			type: "user" as const,
		});

		insertText(editor, "typed", origin as OpOrigin);
		expect(visibleText(editor)).toBe("typed");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe(prior);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe(prior);

		editor.destroy();
	});

	it("does not capture an applyUpdate write even when the sender tagged user", () => {
		const editor = createEditorWithUndo();
		const adapter = editor.internals.adapter;
		const editorDoc = editor.internals.crdtDoc;
		const blockId = editor.firstBlock()!.id;
		const remoteDoc = adapter.loadDocument(adapter.encodeState(editorDoc));
		const remoteYText = adapter
			.raw<{
				getMap(name: "blocks"): {
					get(key: string): { get(key: string): unknown } | undefined;
				};
			}>(remoteDoc)
			.getMap("blocks")
			.get(blockId)
			?.get("content");
		if (!(remoteYText instanceof Y.Text)) {
			throw new Error(`block ${blockId} has no remote text`);
		}

		const since = Y.encodeStateVector(
			(editorDoc as unknown as { ydoc: Y.Doc }).ydoc,
		);
		adapter.transact(
			remoteDoc,
			() => {
				remoteYText.insert(remoteYText.length, "remote");
			},
			{ type: "user" },
		);
		adapter.applyUpdate(editorDoc, adapter.encodeUpdate(remoteDoc, since));

		expect(visibleText(editor)).toBe("remote");
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe("remote");

		editor.destroy();
	});
});
