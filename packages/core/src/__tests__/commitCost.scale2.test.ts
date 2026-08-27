import type { CommitEvent, DiagnosticEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createHeadlessEditor } from "../index";
import { defaultSchema } from "./fixtures/testSchema";

/**
 * SCALE2 keeps per-commit work proportional to the change, so the pieces that
 * used to re-read the whole document on every apply now advance incrementally
 * or stay memoized. These tests pin the assumptions that lets them:
 * incremental block lengths, a normalizer pass index that survives across
 * applies, and an unknown-type sweep gated on the block count.
 */

function textLength(editor: ReturnType<typeof createHeadlessEditor>, id: string) {
	return editor.getBlock(id)?.length() ?? 0;
}

describe("commit cost stays proportional to the change (SCALE2)", () => {
	it("tracks block length across text-only commits without re-reading the document", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const firstId = editor.firstBlock()!.id;
		const secondId = "scale2-second";

		editor.apply([
			{
				type: "insert-block",
				blockId: secondId,
				blockType: "paragraph",
				props: {},
				position: { after: firstId },
			},
		]);

		// A run of text-only commits: these take the incremental length path.
		for (const chunk of ["alpha", " beta", " gamma"]) {
			editor.apply([
				{
					type: "splice-text",
					blockId: firstId,
					from: textLength(editor, firstId),
					to: textLength(editor, firstId),
					insert: chunk,
				},
			]);
		}
		editor.apply([
			{
				type: "splice-text",
				blockId: firstId,
				from: 0,
				to: 6,
				insert: "",
			},
		]);

		const expectedLength = textLength(editor, firstId);
		expect(expectedLength).toBe("alpha beta gamma".length - 6);

		editor.apply([
			{
				type: "splice-text",
				blockId: secondId,
				from: 0,
				to: 0,
				insert: "tail",
			},
		]);

		// `joinOffset` is read straight out of the tracked length index, so a
		// drifted length shows up here even though every edit above was local.
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => commits.push(event));
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: firstId,
					from: expectedLength,
					to: expectedLength,
					insert: "tail",
				},
				{ type: "delete-block", blockId: secondId },
			],
			{
				structural: {
					kind: "merge",
					targetBlockId: firstId,
					sourceBlockId: secondId,
				},
			},
		);

		const merged = commits
			.flatMap((event) => event.summary.structural)
			.find((change) => change.type === "blocks-merged");
		expect(merged).toMatchObject({ joinOffset: expectedLength });

		editor.destroy();
	});

	it("sees a remote structural change during the next local normalization", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const parentId = editor.firstBlock()!.id;
		const childId = "scale2-child";
		const adapter = editor.internals.adapter;
		const crdtDoc = editor.internals.crdtDoc;

		editor.apply([
			{
				type: "insert-block",
				blockId: childId,
				blockType: "paragraph",
				props: {},
				position: { after: parentId },
			},
		]);

		// A peer parents the block without removing it from blockOrder, the
		// cross-array membership normalization repairs (rule 11). The engine
		// never normalizes on the remote commit itself, so the repair has to
		// come from the next local apply seeing fresh structure.
		const remoteDoc = adapter.loadDocument(adapter.encodeState(crdtDoc));
		const remoteYDoc = adapter.raw<Y.Doc>(remoteDoc);
		remoteYDoc.transact(() => {
			const blocks = remoteYDoc.getMap("blocks");
			const parent = blocks.get(parentId) as Y.Map<unknown>;
			let children = parent.get("children") as Y.Array<string> | undefined;
			if (!children) {
				children = new Y.Array<string>();
				parent.set("children", children);
			}
			children.push([childId]);
		}, "y-websocket");
		adapter.applyUpdate(crdtDoc, adapter.encodeState(remoteDoc));

		const blockOrder = adapter.raw<Y.Doc>(crdtDoc).getArray<string>("blockOrder");
		expect(blockOrder.toArray()).toContain(childId);

		editor.apply([
			{
				type: "splice-text",
				blockId: childId,
				from: 0,
				to: 0,
				insert: "x",
			},
		]);

		expect(blockOrder.toArray()).not.toContain(childId);
		expect(editor.documentState.parentOf(childId)).toBe(parentId);

		editor.destroy();
	});

	it("reports an unknown block type that arrives from a remote commit", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const firstId = editor.firstBlock()!.id;
		const adapter = editor.internals.adapter;
		const crdtDoc = editor.internals.crdtDoc;

		// Drive one apply first so the initial sweep is already behind us.
		editor.apply([
			{
				type: "splice-text",
				blockId: firstId,
				from: 0,
				to: 0,
				insert: "seed",
			},
		]);

		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => diagnostics.push(event));

		const remoteDoc = adapter.loadDocument(adapter.encodeState(crdtDoc));
		const remoteYDoc = adapter.raw<Y.Doc>(remoteDoc);
		remoteYDoc.transact(() => {
			const blocks = remoteYDoc.getMap("blocks");
			const block = new Y.Map<unknown>();
			block.set("type", "futureWidget");
			block.set("props", new Y.Map<unknown>());
			block.set("content", new Y.Text());
			blocks.set("scale2-unknown", block);
			remoteYDoc.getArray<string>("blockOrder").push(["scale2-unknown"]);
		}, "y-websocket");
		adapter.applyUpdate(crdtDoc, adapter.encodeState(remoteDoc));

		editor.apply([
			{
				type: "splice-text",
				blockId: firstId,
				from: 0,
				to: 0,
				insert: "!",
			},
		]);

		expect(
			diagnostics.filter(
				(event) => event.code === "schema-unknown-block",
			),
		).toContainEqual(
			expect.objectContaining({ blockType: "futureWidget" }),
		);

		editor.destroy();
	});
});
