import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
	CommitEvent,
	DiagnosticEvent,
	DocumentOp,
	StructuredOpOrigin,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { deleteBackward, splitBlock } from "../commands";
import {
	createCommandEditor,
	liveRegistry,
} from "../commands/__tests__/fixture";
import { createHeadlessEditor } from "../index";
import { defaultSchema } from "./fixtures/testSchema";

const CLOSED_DOCUMENT_OP_TYPES = [
	"splice-text",
	"format-text",
	"insert-block",
	"delete-block",
	"move-block",
	"set-props",
	"set-meta",
	"grid",
	"app",
	"stream-open",
] as const satisfies readonly DocumentOp["type"][];

const DELETED_OP_SAMPLES = [
	"split-block",
	"merge-blocks",
	"insert-text",
	"convert-block",
	"set-selection",
] as const;

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestRawDocLike = {
	transact(fn: () => void, origin?: unknown): void;
	on(
		event: "afterTransaction",
		handler: (txn: { origin: unknown; local: boolean }) => void,
	): void;
	getMap(name: "blocks"): {
		get(
			blockId: string,
		): { get(key: "content"): TestYTextLike } | undefined;
	};
};

function ownKeys(value: object): string[] {
	return Object.keys(value).sort();
}

function readRepoFile(relativeFromHere: string): string {
	return readFileSync(
		fileURLToPath(new URL(relativeFromHere, import.meta.url)),
		"utf8",
	);
}

function switchCaseLabels(source: string, marker: string): string[] {
	const start = source.indexOf(marker);
	if (start < 0) {
		throw new Error(`missing ${marker}`);
	}
	const switchAt = source.indexOf("switch (op.type)", start);
	if (switchAt < 0) {
		throw new Error(`missing switch (op.type) after ${marker}`);
	}
	const defaultAt = source.indexOf("default:", switchAt);
	if (defaultAt < 0) {
		throw new Error(`missing default after ${marker}`);
	}
	return [
		...source.slice(switchAt, defaultAt).matchAll(/case\s+"([^"]+)"/g),
	].map((match) => match[1]!);
}

function documentOpFlagKeys(source: string): string[] {
	const start = source.indexOf("const DOCUMENT_OP_TYPE_FLAGS");
	if (start < 0) {
		throw new Error("missing DOCUMENT_OP_TYPE_FLAGS");
	}
	const open = source.indexOf("{", start);
	const close = source.indexOf("}", open);
	return [
		...source.slice(open, close).matchAll(/"([^"]+)"\s*:\s*true/g),
	].map((match) => match[1]!);
}

function expectClosedTypeSet(types: readonly string[]): void {
	expect(types).toHaveLength(10);
	expect([...types].sort()).toEqual([...CLOSED_DOCUMENT_OP_TYPES].sort());
}

function visitClosedOpType(type: DocumentOp["type"]): void {
	switch (type) {
		case "splice-text":
		case "format-text":
		case "insert-block":
		case "delete-block":
		case "move-block":
		case "set-props":
		case "set-meta":
		case "grid":
		case "app":
		case "stream-open":
			return;
		default: {
			const _exhaustive: never = type;
			throw new Error(`unexpected DocumentOp type: ${String(_exhaustive)}`);
		}
	}
}

function collectLocalTxnOrigins(editor: ReturnType<typeof createHeadlessEditor>) {
	const txnOrigins: unknown[] = [];
	editor.internals.adapter
		.raw<TestRawDocLike>(editor.internals.crdtDoc)
		.on("afterTransaction", (txn) => {
			if (txn.local) {
				txnOrigins.push(txn.origin);
			}
		});
	return txnOrigins;
}

function createEditor() {
	return createHeadlessEditor({ schema: defaultSchema });
}

function tenPrimitiveOps(hostId: string): DocumentOp[] {
	return [
		{
			type: "splice-text",
			blockId: hostId,
			from: 0,
			to: 0,
			insert: "hi",
		},
		{
			type: "format-text",
			blockId: hostId,
			from: 0,
			to: 2,
			marks: { bold: true },
		},
		{
			type: "insert-block",
			blockId: "op-table",
			blockType: "table",
			props: {},
			position: "last",
		},
		{
			type: "insert-block",
			blockId: "op-moved",
			blockType: "paragraph",
			props: {},
			position: "last",
		},
		{
			type: "set-props",
			blockId: hostId,
			props: { type: "heading", level: 2 },
		},
		{
			type: "set-meta",
			blockId: hostId,
			namespace: "note",
			data: { a: 1 },
		},
		{
			type: "move-block",
			blockId: "op-moved",
			position: "first",
		},
		{
			type: "grid",
			blockId: "op-table",
			change: { kind: "insert-row", index: 1 },
		},
		{
			type: "app",
			change: {
				kind: "create",
				appId: "op-app",
				appType: "counter",
				config: { n: 1 },
				placement: { mode: "inline", blockId: hostId, index: 0 },
			},
		},
		{
			type: "stream-open",
			blockId: hostId,
		},
		{
			type: "delete-block",
			blockId: "op-moved",
		},
	];
}

describe("ops OP1–OP5", () => {
	it("OP1: apply accepts the ten primitives and rejects an eleventh type", () => {
		expect(CLOSED_DOCUMENT_OP_TYPES).toHaveLength(10);
		for (const type of CLOSED_DOCUMENT_OP_TYPES) {
			visitClosedOpType(type);
		}

		const editor = createEditor();
		const hostId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		const commits: CommitEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.on("commit", (event) => {
			commits.push(event);
		});

		const ops = tenPrimitiveOps(hostId);
		const appliedTypes = [...new Set(ops.map((op) => op.type))];
		expectClosedTypeSet(appliedTypes);

		editor.apply(ops);
		expect(commits.length).toBeGreaterThan(0);
		expect(
			diagnostics.some((event) =>
				String(event.message).includes("unknown op type"),
			),
		).toBe(false);
		expect(editor.getBlock(hostId)!.type).toBe("heading");
		expect(editor.getBlock("op-table")).not.toBeNull();
		expect(editor.getBlock("op-moved")).toBeNull();

		commits.length = 0;
		diagnostics.length = 0;
		editor.apply([
			{
				type: "split-block",
				blockId: hostId,
				offset: 1,
				newBlockId: "nope",
			} as unknown as DocumentOp,
		]);
		expect(commits).toHaveLength(0);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_004",
				message: "unknown op type split-block",
			}),
		);

		editor.destroy();
	});

	it("OP2: dispatch stamps origin.intent; remote and bare apply do not synthesize it", () => {
		const editor = createCommandEditor([
			{ id: "src", type: "paragraph", text: "hello world" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.selectText("src", 5, 5);
		expect(registry.dispatch(splitBlock, undefined)).toBe(true);
		const dispatched = commits[0]!.origin;
		expect(dispatched.intent).toBe("pen.splitBlock");
		expect(Object.hasOwn(dispatched, "intent")).toBe(true);

		commits.length = 0;
		editor.apply([
			{
				type: "splice-text",
				blockId: "src",
				from: 0,
				to: 0,
				insert: "local",
			},
		]);
		const bare = commits[0]!.origin;
		expect(Object.hasOwn(bare, "intent")).toBe(false);
		expect(bare.intent).toBeUndefined();

		commits.length = 0;
		const adapter = editor.internals.adapter;
		const crdtDoc = editor.internals.crdtDoc;
		const remoteDoc = adapter.loadDocument(adapter.encodeState(crdtDoc));
		const remoteYDoc = adapter.raw<TestRawDocLike>(remoteDoc);
		const remoteYText = remoteYDoc
			.getMap("blocks")
			.get("src")
			?.get("content");
		if (!remoteYText) {
			throw new Error("missing remote text for src");
		}
		remoteYDoc.transact(() => {
			remoteYText.insert(0, "peer");
		}, "y-websocket");
		adapter.applyUpdate(crdtDoc, adapter.encodeState(remoteDoc));
		const remote = commits.find((event) => event.source === "remote");
		expect(remote).toBeDefined();
		expect(remote!.origin).toEqual({ type: "collaborator" });
		expect(Object.hasOwn(remote!.origin, "intent")).toBe(false);

		editor.destroy();
	});

	it("OP3: conversion is block-props-changed with type; split/merge stay tagged recipes", () => {
		const convertedEditor = createCommandEditor([
			{ id: "cvt", type: "paragraph", text: "hello" },
		]);
		const convertedCommits: CommitEvent[] = [];
		convertedEditor.on("commit", (event) => {
			convertedCommits.push(event);
		});
		convertedEditor.apply([
			{
				type: "set-props",
				blockId: "cvt",
				props: { type: "heading", level: 2 },
			},
		]);
		const converted = convertedCommits[0]!;
		expect(
			converted.summary.structural.map((change) => change.type),
		).not.toContain("block-converted");
		expect(converted.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "block-props-changed",
				blockId: "cvt",
				keys: expect.arrayContaining(["type"]),
			}),
		);
		expect(converted.origin.intent).toBeUndefined();
		convertedEditor.destroy();

		const splitEditor = createCommandEditor([
			{ id: "src", type: "paragraph", text: "hello world" },
		]);
		const splitCommits: CommitEvent[] = [];
		splitEditor.on("commit", (event) => {
			splitCommits.push(event);
		});
		splitEditor.selectText("src", 5, 5);
		expect(liveRegistry(splitEditor).dispatch(splitBlock, undefined)).toBe(
			true,
		);
		const split = splitCommits[0]!;
		expect(split.origin.intent).toBe("pen.splitBlock");
		expect(split.origin.intent).not.toBe("block-split");
		expect(split.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "block-split",
				blockId: "src",
				offset: 5,
			}),
		);
		splitEditor.destroy();

		const mergeEditor = createCommandEditor([
			{ id: "target", type: "paragraph", text: "hello" },
			{ id: "source", type: "paragraph", text: " world" },
		]);
		const mergeCommits: CommitEvent[] = [];
		mergeEditor.on("commit", (event) => {
			mergeCommits.push(event);
		});
		mergeEditor.selectText("source", 0, 0);
		expect(
			liveRegistry(mergeEditor).dispatch(deleteBackward, {
				granularity: "grapheme",
			}),
		).toBe(true);
		const merged = mergeCommits[0]!;
		expect(merged.origin.intent).toBe("pen.deleteBackward");
		expect(merged.origin.intent).not.toBe("blocks-merged");
		expect(merged.origin.intent).not.toBe("pen.mergeBlocks");
		expect(merged.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "blocks-merged",
				targetBlockId: "target",
				sourceBlockId: "source",
				joinOffset: 5,
			}),
		);
		mergeEditor.destroy();
	});

	it("OP4: validation, profile, suggest-mode, and the tool table key the ten primitives plus intent", () => {
		const pipeline = readRepoFile("../editor/applyPipelineRunner.ts");
		expectClosedTypeSet(switchCaseLabels(pipeline, "function malformedOpMessage"));
		expectClosedTypeSet(switchCaseLabels(pipeline, "export function validateOp"));
		expectClosedTypeSet(
			switchCaseLabels(pipeline, "export function executeSingleOp"),
		);

		const profile = readRepoFile("../editor/profilePolicy.ts");
		expectClosedTypeSet(
			switchCaseLabels(profile, "function getProfileControlledBlockType"),
		);

		const toolTable = readRepoFile(
			"../../../extensions/document-ops/src/constants/payloadValidation.ts",
		);
		expectClosedTypeSet(documentOpFlagKeys(toolTable));
		expect(toolTable).toContain("satisfies Record<DocumentOp[\"type\"], true>");

		const suggestMode = readRepoFile(
			"../../../extensions/ai/src/suggestions/suggestMode.ts",
		);
		expectClosedTypeSet(
			switchCaseLabels(
				suggestMode,
				"export function transformOpsForSuggestModeWithMetadata",
			),
		);
		expect(suggestMode).toContain('intent === "pen.splitBlock"');
		expect(suggestMode).toMatch(/options\.origin\.intent/);

		const editor = createEditor();
		const hostId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		const commits: CommitEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply(tenPrimitiveOps(hostId), {
			origin: { type: "user", intent: "pen.splitBlock" },
		});
		expect(commits.length).toBeGreaterThan(0);
		expect(commits[0]!.origin.intent).toBe("pen.splitBlock");
		expect(
			diagnostics.some((event) =>
				String(event.message).includes("unknown op type"),
			),
		).toBe(false);

		for (const deleted of DELETED_OP_SAMPLES) {
			commits.length = 0;
			diagnostics.length = 0;
			editor.apply([
				{ type: deleted, blockId: hostId } as unknown as DocumentOp,
			]);
			expect(commits).toHaveLength(0);
			expect(diagnostics).toContainEqual(
				expect.objectContaining({
					code: "PEN_APPLY_004",
					message: `unknown op type ${deleted}`,
				}),
			);
		}

		editor.destroy();
	});

	it("OP5: a command recipe is one apply, one transaction, one summary, one CommitEvent", () => {
		const editor = createCommandEditor([
			{ id: "src", type: "paragraph", text: "hello world" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		const txnOrigins = collectLocalTxnOrigins(editor);
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.selectText("src", 5, 5);
		expect(registry.dispatch(splitBlock, undefined)).toBe(true);

		expect(commits).toHaveLength(1);
		const commit = commits[0]!;
		expect(ownKeys(commit)).toContain("summary");
		expect(commit.summary).toEqual(
			expect.objectContaining({
				commitId: commit.commitId,
			}),
		);
		expect(commit.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "block-split",
				blockId: "src",
				offset: 5,
			}),
		);
		expect(commit.summary.blockText.length).toBeGreaterThan(0);

		const recipeTxns = txnOrigins.filter((origin) => {
			if (origin == null || typeof origin !== "object") {
				return false;
			}
			return (origin as StructuredOpOrigin).intent === "pen.splitBlock";
		});
		expect(recipeTxns).toHaveLength(1);
		expect(editor.getBlock("src")!.textContent()).toBe("hello");

		editor.destroy();
	});
});
