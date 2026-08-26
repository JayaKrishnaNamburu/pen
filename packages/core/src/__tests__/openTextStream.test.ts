import type { CommitEvent, Point } from "@input/pen-types";
import { HOOK_PRIORITY_AUTH } from "@input/pen-types";
import { mapOffsetThroughSplices } from "../changes/mapOffsetThroughSplices";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import {
	applyMergeBlocks,
	applySplitBlock,
	createEditor as createCoreEditor,
} from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

function mapSerial(
	start: Point,
	summaries: readonly CommitEvent["summary"][],
): Point {
	let point = start;
	for (const summary of summaries) {
		const change = summary.blockText.find(
			(item) => item.blockId === point.blockId,
		);
		if (!change) {
			continue;
		}
		point = {
			blockId: point.blockId,
			offset: mapOffsetThroughSplices(change.splices, point.offset, 1),
		};
	}
	return point;
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestRawDocLike = {
	transact(fn: () => void, origin?: unknown): void;
	getMap(name: "blocks"): {
		get(
			blockId: string,
		): { get(key: "content"): TestYTextLike } | undefined;
	};
};

describe("editor.openTextStream (Wave 2.4)", () => {
	it("ST1: each flush is one commit with source stream", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const commits: CommitEvent[] = [];
		const diagnostics: string[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.on("diagnostic", (event) => {
			diagnostics.push(event.code);
		});

		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "gen-1" } },
		);
		expect(commits).toHaveLength(0);

		writer.append("hel");
		writer.append("lo");
		writer.flush();
		expect(commits).toHaveLength(1);
		expect(commits[0].source).toBe("stream");
		expect(commits[0].origin).toMatchObject({
			type: "ai",
			groupId: "gen-1",
			source: "stream",
		});
		expect(editor.getBlock(blockId)!.textContent()).toBe("hello");

		writer.flush();
		expect(commits).toHaveLength(1);

		writer.append("!");
		writer.flush();
		expect(commits).toHaveLength(2);
		expect(commits[1].source).toBe("stream");
		expect(commits[1].origin.groupId).toBe("gen-1");
		expect(editor.getBlock(blockId)!.textContent()).toBe("hello!");

		writer.close();
		expect(diagnostics).not.toContain("normalize-cap");
		editor.destroy();
	});

	it("ST3: close undefers after the final flush", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: string[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event.code);
		});
		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "defer-1" } },
		);

		writer.append("hello");
		writer.close();

		expect(editor.getBlock(blockId)!.textContent()).toBe("hello");
		expect(diagnostics).not.toContain("normalize-cap");

		editor.destroy();
	});

	it("ST1: a highest beforeApply hook rejecting stream-open prevents all writes", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.onBeforeApply(
			(ops) => {
				if (ops.some((op) => op.type === "stream-open")) {
					return [];
				}
				return ops;
			},
			{ priority: HOOK_PRIORITY_AUTH },
		);

		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "veto" } },
		);
		writer.append("hello");
		writer.flush();
		writer.close();

		expect(commits).toHaveLength(0);
		expect(editor.getBlock(blockId)!.textContent()).toBe("");

		editor.destroy();
	});

	it("ST2: two writers plus remote splices keep position on a serial map", () => {
		const editor = createEditor();
		const firstId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "b2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		const secondId = "b2";

		const writerA = editor.openTextStream(
			{ blockId: firstId },
			{ origin: { type: "ai", groupId: "a" } },
		);
		const writerB = editor.openTextStream(
			{ blockId: secondId },
			{ origin: { type: "ai", groupId: "b" } },
		);
		const startA = writerA.position;
		const startB = writerB.position;

		const summaries: CommitEvent["summary"][] = [];
		editor.on("commit", (event) => {
			summaries.push(event.summary);
		});

		writerA.append("aa");
		writerA.flush();
		writerB.append("bb");
		writerB.flush();

		const adapter = editor.internals.adapter;
		const editorDoc = editor.internals.crdtDoc;
		const remoteDoc = adapter.loadDocument(adapter.encodeState(editorDoc));
		const remoteYDoc = adapter.raw<TestRawDocLike>(remoteDoc);
		const remoteFirst = remoteYDoc
			.getMap("blocks")
			.get(firstId)
			?.get("content");
		const remoteSecond = remoteYDoc
			.getMap("blocks")
			.get(secondId)
			?.get("content");
		if (!remoteFirst || !remoteSecond) {
			throw new Error("missing remote text");
		}
		remoteYDoc.transact(() => {
			remoteFirst.insert(0, "x");
			remoteSecond.insert(0, "y");
		}, "y-websocket");
		adapter.applyUpdate(editorDoc, adapter.encodeState(remoteDoc));

		expect(writerA.position).toEqual(mapSerial(startA, summaries));
		expect(writerB.position).toEqual(mapSerial(startB, summaries));

		writerA.close();
		writerB.close();
		editor.destroy();
	});

	it("ST2: split-during-stream carries the write head with the moved tail", () => {
		const editor = createEditor();
		const source = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId: source,
				from: 0,
				to: 0,
				insert: "meadow sage",
			},
		]);

		const writer = editor.openTextStream(
			{ blockId: source },
			{ origin: { type: "ai", groupId: "split-stream" } },
		);
		expect(writer.position).toEqual({ blockId: source, offset: 11 });

		applySplitBlock(editor, {
			blockId: source,
			offset: 6,
			newBlockId: "dest",
		});

		expect(writer.position).toEqual({ blockId: "dest", offset: 5 });

		writer.append("!");
		writer.flush();
		expect(editor.getBlock(source)!.textContent()).toBe("meadow");
		expect(editor.getBlock("dest")!.textContent()).toBe(" sage!");
		expect(writer.position).toEqual({ blockId: "dest", offset: 6 });

		writer.close();
		editor.destroy();
	});

	it("ST2: stream-head survival through split, merge, and removal", () => {
		const editor = createEditor();
		const target = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId: target,
				from: 0,
				to: 0,
				insert: "meadow sage",
			},
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "keep",
				from: 0,
				to: 0,
				insert: "keep",
			},
		]);

		const writer = editor.openTextStream(
			{ blockId: target },
			{ origin: { type: "ai", groupId: "survive" } },
		);

		applySplitBlock(editor, {
			blockId: target,
			offset: 6,
			newBlockId: "tail",
		});
		expect(writer.position).toEqual({ blockId: "tail", offset: 5 });

		writer.append("!");
		writer.flush();
		expect(editor.getBlock("tail")!.textContent()).toBe(" sage!");
		expect(writer.position).toEqual({ blockId: "tail", offset: 6 });

		applyMergeBlocks(editor, {
			targetBlockId: target,
			sourceBlockId: "tail",
		});
		expect(writer.position).toEqual({ blockId: target, offset: 12 });

		writer.append("?");
		writer.flush();
		expect(editor.getBlock(target)!.textContent()).toBe("meadow sage!?");
		expect(writer.position).toEqual({ blockId: target, offset: 13 });

		const lastKnown = writer.position;
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.apply([{ type: "delete-block", blockId: target }]);
		expect(editor.getBlock(target)).toBeNull();
		expect(writer.position).toEqual(lastKnown);

		writer.append("dropped");
		writer.flush();
		expect(commits).toHaveLength(1);
		expect(
			commits[0]?.summary.structural.some(
				(change) =>
					change.type === "block-removed" &&
					change.blockId === target,
			),
		).toBe(true);
		expect(editor.getBlock("keep")!.textContent()).toBe("keep");

		writer.close();
		editor.destroy();
	});

	it("ST2: resolve null retries while the block lives and drops when it is gone", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "null-resolve" } },
		);
		const start = writer.position;
		const anchors = editor.anchors as {
			resolve: typeof editor.anchors.resolve;
		};
		const originalResolve = anchors.resolve.bind(editor.anchors);
		let forceNull = true;
		anchors.resolve = (anchor) => {
			if (forceNull) {
				return null;
			}
			return originalResolve(anchor);
		};

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "x" },
		]);
		expect(writer.position).toEqual(start);
		expect(editor.getBlock(blockId)).not.toBeNull();

		forceNull = false;
		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "y" },
		]);
		expect(writer.position).toEqual({ blockId, offset: 2 });

		forceNull = true;
		editor.apply([{ type: "delete-block", blockId }]);
		expect(editor.getBlock(blockId)).toBeNull();
		expect(writer.position).toEqual({ blockId, offset: 2 });

		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		writer.append("dropped");
		writer.flush();
		expect(commits).toHaveLength(0);

		anchors.resolve = originalResolve;
		writer.close();
		editor.destroy();
	});

	it("ST2: merge-source head at offset 0 follows the join", () => {
		const editor = createEditor();
		const target = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId: target,
				from: 0,
				to: 0,
				insert: "meadow",
			},
			{
				type: "insert-block",
				blockId: "source",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		const writer = editor.openTextStream(
			{ blockId: "source" },
			{ origin: { type: "ai", groupId: "merge-zero" } },
		);
		expect(writer.position).toEqual({ blockId: "source", offset: 0 });

		applyMergeBlocks(editor, {
			targetBlockId: target,
			sourceBlockId: "source",
		});
		expect(writer.position).toEqual({ blockId: target, offset: 6 });

		writer.append("!");
		writer.flush();
		expect(editor.getBlock(target)!.textContent()).toBe("meadow!");
		expect(writer.position).toEqual({ blockId: target, offset: 7 });

		writer.close();
		editor.destroy();
	});

	it("AN4: stream head liveCount is stable across ordinary flushes", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "live-count" } },
		);
		const minted = editor.anchors.liveCount;
		expect(minted).toBeGreaterThan(0);

		writer.append("a");
		writer.flush();
		expect(editor.anchors.liveCount).toBe(minted);

		for (let i = 0; i < 99; i++) {
			writer.append("a");
			writer.flush();
		}

		expect(editor.anchors.liveCount).toBe(minted);
		expect(editor.getBlock(blockId)!.textContent()).toBe("a".repeat(100));

		writer.close();
		editor.destroy();
	});
});
