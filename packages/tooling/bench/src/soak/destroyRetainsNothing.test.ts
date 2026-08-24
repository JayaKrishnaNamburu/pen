import { describe, expect, it } from "vitest";
import { createDecorationSet, defineExtension } from "@input/pen-core";
import { createTestEditor } from "@input/pen-test";
import { undoExtension } from "@input/pen-undo";
import { FIELD_EDITOR_SLOT_KEY } from "@input/pen-types";

// SCALE4 / CACHE-INVENTORY.md. Headless only. No casts into editor internals.
// Destroy releases block revisions, listeners, session scopes, decorations,
// the summary log, documentState indexes, and the undo:manager slot.
// Module-lifetime caches are not observable from this package.

describe("SCALE4 destroy retention inventory", () => {
	it("SCALE4: destroy clears block revisions, listeners, and session scopes", async () => {
		const editor = createTestEditor({
			blocks: [{ type: "paragraph", content: "hi" }],
		});
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 2,
				to: 2,
				insert: "x" }],
			{ origin: "user" },
		);
		editor.on("documentCommit", () => {});

		expect(editor.getBlockRevision(blockId)).toBeGreaterThan(0);
		expect(editor.internals.hasListeners("documentCommit")).toBe(true);
		expect(editor.internals.documentSession?.listScopes().length).toBeGreaterThan(
			0,
		);

		await editor.destroy();

		expect(editor.getBlockRevision(blockId)).toBe(0);
		expect(editor.internals.hasListeners("documentCommit")).toBe(false);
		const session = editor.internals.documentSession;
		expect(session).not.toBeNull();
		expect(session!.listScopes()).toEqual([]);
		expect(session!.getScope(session!.rootScope.id)).toBeNull();
	});

	it("SCALE4: destroy releases decoration set and summary log", async () => {
		const editor = createTestEditor({
			blocks: [{ type: "paragraph", content: "hi" }],
			extensions: [
				defineExtension({
					name: "scale4-deco",
					decorations() {
						return createDecorationSet([
							{
								type: "inline",
								blockId: "x",
								from: 0,
								to: 1,
								attributes: { "data-pen-scale4": true },
							},
						]);
					},
				}),
			],
		});
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 2,
				to: 2,
				insert: "x" }],
			{ origin: "user" },
		);
		editor.requestDecorationUpdate();
		const decorations = editor.getDecorations();
		const summary = editor.lastChangeSummary;

		expect(decorations.decorations.length).toBe(1);
		expect(summary).not.toBeNull();

		await editor.destroy();

		expect(editor.getDecorations()).not.toBe(decorations);
		expect(editor.getDecorations().decorations.length).toBe(0);
		expect(editor.lastChangeSummary).toBeNull();
		expect(editor.lastChangeSummary).not.toBe(summary);
	});

	it("SCALE4: destroy releases documentState indexes and undo:manager slot", async () => {
		const editor = createTestEditor({
			blocks: [{ type: "paragraph", content: "hi" }],
			extensions: [undoExtension()],
		});
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 2,
				to: 2,
				insert: "x" }],
			{ origin: "user" },
		);

		expect(editor.documentState.indexOf(blockId)).toBe(0);
		expect(editor.documentState.blockCount).toBe(1);
		expect(editor.undoManager.canUndo()).toBe(true);

		await editor.destroy();

		expect(editor.documentState.indexOf(blockId)).toBe(-1);
		expect(editor.documentState.blockCount).toBe(0);
		expect(editor.undoManager.canUndo()).toBe(false);
		expect(editor.internals.getSlot("undo:manager") == null).toBe(true);
	});

	it("SCALE4: headless destroy has no field editor to release", async () => {
		const editor = createTestEditor({
			blocks: [{ type: "paragraph", content: "hi" }],
		});
		await editor.whenReady();
		expect(editor.internals.getSlot(FIELD_EDITOR_SLOT_KEY) == null).toBe(true);
		await editor.destroy();
		expect(editor.internals.getSlot(FIELD_EDITOR_SLOT_KEY) == null).toBe(true);
	});
});
