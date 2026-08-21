import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { createYjsDocument, initBlockMap } from "../document";
import { createObserver } from "../events";
import { createYjsUndoManager, DEFAULT_UNDO_MAX_DEPTH } from "../undo";

describe("undo", () => {
	const adapter = yjsAdapter();

	it("undoes and redoes text insertion", () => {
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc);
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;

		doc.ydoc.transact(() => {
			ytext.insert(0, "Hello");
		}, "user");

		expect(ytext.toString()).toBe("Hello");

		undo.undo();
		expect(ytext.toString()).toBe("");

		undo.redo();
		expect(ytext.toString()).toBe("Hello");
	});

	it("I1: tags undo and redo transactions with distinct history sources", () => {
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc);
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;
		doc.ydoc.transact(() => {
			ytext.insert(0, "Hello");
		}, "user");

		const origins: unknown[] = [];
		createObserver(doc, (event) => {
			origins.push(event.origin);
		});

		undo.undo();
		undo.redo();

		expect(origins).toEqual([
			{ type: "history", source: "undo" },
			{ type: "history", source: "redo" },
		]);
	});

	it("stopCapturing creates separate undo steps", () => {
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc);
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;

		doc.ydoc.transact(() => {
			ytext.insert(0, "First");
		}, "user");

		undo.stopCapturing();

		doc.ydoc.transact(() => {
			ytext.insert(5, " Second");
		}, "user");

		expect(ytext.toString()).toBe("First Second");

		undo.undo();
		expect(ytext.toString()).toBe("First");

		undo.undo();
		expect(ytext.toString()).toBe("");
	});

	it("does not capture collaborator-origin changes", () => {
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc);
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;

		doc.ydoc.transact(() => {
			ytext.insert(0, "Remote text");
		}, "collaborator");

		expect(ytext.toString()).toBe("Remote text");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("Remote text");
	});

	it("undo restores the document and redo reapplies the same text", () => {
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc);
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;
		expect(ytext.toString()).toBe("");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("");

		doc.ydoc.transact(() => {
			ytext.insert(0, "text");
		}, "user");
		expect(ytext.toString()).toBe("text");

		expect(undo.undo()).toBe(true);
		expect(ytext.toString()).toBe("");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("");

		expect(undo.redo()).toBe(true);
		expect(ytext.toString()).toBe("text");
		expect(undo.redo()).toBe(false);
		expect(ytext.toString()).toBe("text");
	});

	it("returns false when undo/redo stack is empty", () => {
		const doc = createYjsDocument(adapter);
		const undo = createYjsUndoManager(doc);
		expect(undo.undo()).toBe(false);
		expect(undo.redo()).toBe(false);
	});

	it("restores deleted block content after undo by default", () => {
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
			const block = doc.penDocument.blocks.get("b1")!;
			const ytext = block.get("content") as Y.Text;
			ytext.insert(0, "Hello world");
		});

		const undo = createYjsUndoManager(doc);

		doc.ydoc.transact(() => {
			doc.penDocument.blockOrder.delete(0, 1);
			doc.penDocument.blocks.delete("b1");
		}, "user");

		expect(doc.penDocument.blockOrder.toArray()).toEqual([]);
		expect(doc.penDocument.blocks.get("b1")).toBeUndefined();

		undo.undo();

		expect(doc.penDocument.blockOrder.toArray()).toEqual(["b1"]);
		const restoredBlock = doc.penDocument.blocks.get("b1");
		expect(restoredBlock).toBeDefined();
		expect(restoredBlock?.get("type")).toBe("paragraph");
		expect((restoredBlock?.get("content") as Y.Text).toString()).toBe(
			"Hello world",
		);
	});

	it("CH7 streaming-writes fixture keeps undo stack bounded and redo intact within the window", () => {
		const maxDepth = 8;
		const commitCount = 40;
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc, {
			captureTimeout: 0,
			maxDepth,
		});
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;

		let undoItemsAdded = 0;
		undo.onStackItemAdded?.((_item, kind) => {
			if (kind === "undo") {
				undoItemsAdded += 1;
			}
		});

		for (let i = 0; i < commitCount; i++) {
			doc.ydoc.transact(() => {
				ytext.insert(ytext.length, `${i % 10}`);
			}, "user");
			undo.stopCapturing();
		}

		const fullText = ytext.toString();
		expect(fullText).toHaveLength(commitCount);
		expect(undoItemsAdded).toBe(commitCount);

		const windowText = fullText.slice(commitCount - maxDepth);
		const retainedPrefix = fullText.slice(0, commitCount - maxDepth);

		let undone = 0;
		while (undo.undo()) {
			undone += 1;
		}
		expect(undone).toBe(maxDepth);
		expect(undo.canUndo()).toBe(false);
		expect(ytext.toString()).toBe(retainedPrefix);

		let redone = 0;
		while (undo.redo()) {
			redone += 1;
		}
		expect(redone).toBe(maxDepth);
		expect(ytext.toString()).toBe(fullText);
		expect(ytext.toString().endsWith(windowText)).toBe(true);

		expect(undo.undo()).toBe(true);
		expect(undo.undo()).toBe(true);
		expect(undo.redo()).toBe(true);
		expect(ytext.toString()).toBe(fullText.slice(0, commitCount - 1));
	});

	it("CH7 default undo cap is 500", () => {
		expect(DEFAULT_UNDO_MAX_DEPTH).toBe(500);

		const extraCommits = 3;
		const commitCount = DEFAULT_UNDO_MAX_DEPTH + extraCommits;
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc, { captureTimeout: 0 });
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;

		for (let i = 0; i < commitCount; i++) {
			doc.ydoc.transact(() => {
				ytext.insert(ytext.length, "x");
			}, "user");
			undo.stopCapturing();
		}

		let undone = 0;
		while (undo.undo()) {
			undone += 1;
		}
		expect(undone).toBe(DEFAULT_UNDO_MAX_DEPTH);
		expect(ytext.toString()).toBe("x".repeat(extraCommits));
	});

	it("CH7 destroy() unregisters the Yjs undo manager so later writes are not captured", () => {
		const doc = createYjsDocument(adapter);
		doc.ydoc.transact(() => {
			initBlockMap(doc.penDocument.blocks, "b1", "paragraph", "inline");
			doc.penDocument.blockOrder.push(["b1"]);
		});

		const undo = createYjsUndoManager(doc);
		const block = doc.penDocument.blocks.get("b1")!;
		const ytext = block.get("content") as Y.Text;

		undo.destroy();
		undo.destroy();

		doc.ydoc.transact(() => {
			ytext.insert(0, "Hello");
		}, "user");

		expect(ytext.toString()).toBe("Hello");
		expect(undo.undo()).toBe(false);
		expect(ytext.toString()).toBe("Hello");
	});
});
