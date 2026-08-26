import { createEditor, undoMetadataControllerFacet } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import {
	type MutationGroupMetadata,
	type UndoHistoryMetadataController,
	MUTATION_GROUP_METADATA_KEY,
} from "@input/pen-types";
import { describe, expect, it, vi } from "vitest";

import { undoExtension } from "../undoExtension";

function getHistoryMetadataController(editor: ReturnType<typeof createEditor>) {
	return editor.facet(undoMetadataControllerFacet) as
		| UndoHistoryMetadataController
		| null;
}

describe("@input/pen-undo history metadata", () => {
	it("buffers metadata for the next history entry after capture stops", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension()],
		});
		const controller = getHistoryMetadataController(editor);
		const blockId = editor.firstBlock()!.id;
		const restoredValues: Array<string | null> = [];

		expect(controller).not.toBeNull();
		controller!.registerMetadataRestorer<string>(
			"test",
			(value: string | null) => {
				restoredValues.push(value);
			},
		);

		editor.apply([{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "A" }], {
			origin: "user",
		});
		controller!.setCurrentEntryMetadata("test", {
			before: "step-1-before",
			after: "step-1-after",
		});

		editor.undoManager.stopCapturing();

		controller!.setCurrentEntryMetadata("test", {
			before: "step-2-before",
			after: "step-2-after",
		});
		editor.apply([{ type: "splice-text", blockId, from: 1,
				to: 1,
				insert: "B" }], {
			origin: "user",
		});
		expect(editor.getBlock(blockId)?.textContent()).toBe("AB");

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("A");
		expect(restoredValues).toEqual(["step-2-before"]);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("");
		expect(restoredValues).toEqual(["step-2-before", "step-1-before"]);

		editor.destroy();
	});

	it("restores null metadata for history entries without registered state", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension()],
		});
		const controller = getHistoryMetadataController(editor);
		const blockId = editor.firstBlock()!.id;
		const restoredValues: Array<string | null> = [];

		expect(controller).not.toBeNull();
		controller!.registerMetadataRestorer<string>(
			"test",
			(value: string | null) => {
				restoredValues.push(value);
			},
		);

		editor.apply([{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "A" }], {
			origin: "user",
		});
		controller!.setCurrentEntryMetadata("test", {
			before: "step-1-before",
			after: "step-1-after",
		});

		editor.undoManager.stopCapturing();

		editor.apply([{ type: "splice-text", blockId, from: 1,
				to: 1,
				insert: "B" }], {
			origin: "user",
		});
		expect(editor.getBlock(blockId)?.textContent()).toBe("AB");

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("A");
		expect(restoredValues).toEqual([null]);

		editor.destroy();
	});

	it("keeps explicit undo groups merged across capture timeouts", async () => {
		vi.useFakeTimers();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "A" }], {
			origin: "user",
			undoGroupId: "group-1",
		});
		await vi.advanceTimersByTimeAsync(550);
		editor.apply([{ type: "splice-text", blockId, from: 1,
				to: 1,
				insert: "B" }], {
			origin: "user",
			undoGroupId: "group-1",
		});

		expect(editor.getBlock(blockId)?.textContent()).toBe("AB");
		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("");
		expect(editor.undoManager.undo()).toBe(false);

		editor.destroy();
		vi.useRealTimers();
	});

	it("records structured origin group metadata and uses it as the undo group", async () => {
		vi.useFakeTimers();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension()],
		});
		const controller = getHistoryMetadataController(editor);
		const blockId = editor.firstBlock()!.id;

		editor.apply([{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "A" }], {
			origin: {
				type: "ai",
				groupId: "group-ai-1",
				requestId: "request-1",
				actorId: "assistant-1",
				source: "test",
			},
		});
		await vi.advanceTimersByTimeAsync(550);
		editor.apply([{ type: "splice-text", blockId, from: 1,
				to: 1,
				insert: "B" }], {
			origin: {
				type: "ai",
				groupId: "group-ai-1",
				requestId: "request-1",
			},
		});

		const metadata =
			controller!.getCurrentEntryMetadata<MutationGroupMetadata>(
				MUTATION_GROUP_METADATA_KEY,
			);
		expect(metadata?.after).toMatchObject({
			groupId: "group-ai-1",
			originType: "ai",
			requestId: "request-1",
		});
		expect(editor.getBlock(blockId)?.textContent()).toBe("AB");
		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("");
		expect(editor.undoManager.undo()).toBe(false);

		editor.destroy();
		vi.useRealTimers();
	});
});
