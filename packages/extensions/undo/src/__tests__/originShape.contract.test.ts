import { createEditor, runMigrations, type DocumentMigration } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { createTwoPeerHarness } from "@input/pen-test";
import type { CommitEvent, Editor, OpOrigin } from "@input/pen-types";
import { describe, expect, it } from "vitest";

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
 * These tests go through `editor.apply` and assert on the resulting document,
 * so they fail the moment that shape stops being treated as a tracked user
 * origin. They also assert the inverse: collaborator and migration must stay
 * uncaptured.
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
				type: "insert-text",
				blockId,
				offset: editor.getBlock(blockId)!.length(),
				text,
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
					type: "insert-text",
					blockId,
					offset: editor.getBlock(blockId)!.length(),
					text,
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
			[{ type: "insert-text", blockId: "b1", offset: 5, text: " from-b" }],
			{ origin: "user" },
		);
		harness.exchange("b-then-a");
		harness.assertConverged();

		expect(visibleText(harness.peerA.editor, "b1")).toBe("Hello from-b");
		expect(remoteOrigins.length).toBeGreaterThan(0);
		expect(remoteOrigins.every((type) => type === "collaborator")).toBe(true);
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
});
