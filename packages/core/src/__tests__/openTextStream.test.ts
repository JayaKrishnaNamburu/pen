import { undoExtension } from "@input/pen-undo";
import type { CommitEvent, Point } from "@input/pen-types";
import { HOOK_PRIORITY_AUTH } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import { createEditor as createCoreEditor } from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const undoOnlyPreset = {
	resolve() {
		return { extensions: [undoExtension()] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

function mapSerial(start: Point, summaries: readonly CommitEvent["summary"][]): Point {
	let point = start;
	for (const summary of summaries) {
		point = summary.mapPoint(point) ?? point;
	}
	return point;
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestRawDocLike = {
	transact(fn: () => void, origin?: unknown): void;
	getMap(name: "blocks"): {
		get(blockId: string): { get(key: "content"): TestYTextLike } | undefined;
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
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello",
		);

		writer.flush();
		expect(commits).toHaveLength(1);

		writer.append("!");
		writer.flush();
		expect(commits).toHaveLength(2);
		expect(commits[1].source).toBe("stream");
		expect(commits[1].origin.groupId).toBe("gen-1");
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello!",
		);

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

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello",
		);
		expect(diagnostics).not.toContain("normalize-cap");

		editor.destroy();
	});

	it("ST4: stream commits share groupId and undo as one unit", () => {
		const editor = createEditor({ preset: undoOnlyPreset });
		const blockId = editor.firstBlock()!.id;
		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "undo-stream" } },
		);

		writer.append("hello");
		writer.flush();
		writer.append("!");
		writer.flush();
		writer.close();

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello!",
		);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");
		expect(editor.undoManager.undo()).toBe(false);

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
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");

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
		const remoteFirst = remoteYDoc.getMap("blocks").get(firstId)?.get("content");
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
});
