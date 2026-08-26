import type {
	BlockSchema,
	CommitEvent,
	DiagnosticEvent,
	DocumentOp,
	Editor,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { logicalLengthFromStored } from "../changes/summaryBuilder";
import { defineBlock } from "../schema/defineBlock";
import { defineExtension } from "../schema/defineExtension";
import { blockLogicalText } from "../text/blockLogicalText";
import { createDefaultSchema } from "./fixtures/testSchema";
import { applySplitBlock, createEditor as createCoreEditor } from "../index";

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

type TestYDocLike = {
	on(
		event: "afterTransaction",
		handler: (txn: { origin: unknown; local: boolean }) => void,
	): void;
};

const columns = defineBlock("columns", {
	content: [],
	isContainer: true,
	layout: {
		modes: ["flex"],
		defaultMode: "flex",
		minChildren: 2,
	},
});

function collectLocalTxnOrigins(editor: ReturnType<typeof createEditor>) {
	const txnOrigins: unknown[] = [];
	editor.internals.adapter
		.raw<TestYDocLike>(editor.internals.crdtDoc)
		.on("afterTransaction", (txn) => {
			if (txn.local) {
				txnOrigins.push(txn.origin);
			}
		});
	return txnOrigins;
}

describe("apply pipeline contract (Lane 179)", () => {
	it("keeps a structured origin intact on the commit and the Y transaction", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const origin = {
			type: "ai" as const,
			groupId: "gen-42",
			requestId: "req-7",
			actorId: "model-a",
		};
		const commits: CommitEvent[] = [];
		const txnOrigins = collectLocalTxnOrigins(editor);
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "hello",
				},
			],
			{ origin },
		);

		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin).toBe(origin);
		expect(commits[0]!.source).toBe("apply");
		expect(txnOrigins.length).toBeGreaterThan(0);
		expect(txnOrigins[0]).toBe(origin);
		expect(editor.getBlock(blockId)!.textContent()).toBe("hello");

		editor.destroy();
	});

	it("does not rewrite a collaborator apply origin to user", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const origin = {
			type: "collaborator" as const,
			actorId: "peer-1",
		};
		const commits: CommitEvent[] = [];
		const txnOrigins = collectLocalTxnOrigins(editor);
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "peer",
				},
			],
			{ origin },
		);

		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin).toBe(origin);
		expect(commits[0]!.origin.type).not.toBe("user");
		expect(commits[0]!.source).toBe("remote");
		expect(txnOrigins.length).toBeGreaterThan(0);
		expect(txnOrigins[0]).toBe(origin);
		expect(editor.getBlock(blockId)!.textContent()).toBe("peer");
		expect(Object.keys(origin)).toEqual(["type", "actorId"]);

		editor.destroy();
	});

	it("does not let an onBeforeApply hook rewrite a collaborator origin to user", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const origin = {
			type: "collaborator" as const,
			actorId: "peer-2",
		};
		const commits: CommitEvent[] = [];
		const txnOrigins = collectLocalTxnOrigins(editor);
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.onBeforeApply((_ops, options) => {
			const hookOrigin = options.origin;
			if (hookOrigin && typeof hookOrigin === "object") {
				(hookOrigin as { type: string }).type = "user";
			}
			return _ops;
		});

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "remote-kept",
				},
			],
			{ origin },
		);

		expect(origin.type).toBe("collaborator");
		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin).toBe(origin);
		expect(commits[0]!.origin.type).toBe("collaborator");
		expect(commits[0]!.source).toBe("remote");
		expect(txnOrigins[0]).toBe(origin);
		expect(editor.getBlock(blockId)!.textContent()).toBe("remote-kept");

		editor.destroy();
	});

	it("does not attach split metadata onto the live origin object", () => {
		const editor = createEditor();
		const origin = { type: "user" as const, groupId: "split-1" };
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "b1",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
				{
					type: "splice-text",
					blockId: "b1",
					from: 0,
					to: 0,
					insert: "hello world",
				},
			],
			{ origin },
		);
		applySplitBlock(editor, {
			blockId: "b1",
			offset: 5,
			newBlockId: "b2",
			applyOptions: { origin },
		});

		expect(origin).toEqual({ type: "user", groupId: "split-1" });
		expect("structural" in origin).toBe(false);
		expect(commits.at(-1)!.origin).toBe(origin);
		expect(commits.at(-1)!.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "block-split",
				blockId: "b1",
				newBlockId: "b2",
			}),
		);
		expect(editor.getBlock("b1")!.textContent()).toBe("hello");
		expect(editor.getBlock("b2")!.textContent()).toBe(" world");

		editor.destroy();
	});

	it("drops a throwing onBeforeApply hook with a diagnostic and still applies", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.onBeforeApply(() => {
			throw new Error("hook boom");
		});

		expect(() => {
			editor.apply([
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "kept",
				},
			]);
		}).not.toThrow();

		expect(editor.getBlock(blockId)!.textContent()).toBe("kept");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_005",
				level: "error",
				source: "apply",
				message: "onBeforeApply hook threw",
			}),
		);

		editor.destroy();
	});

	it("ignores in-place hook mutation when the hook then throws", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		const ops: DocumentOp[] = [
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "kept",
			},
		];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.onBeforeApply((incoming) => {
			incoming[0] = {
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "pwned",
			};
			throw new Error("hook boom");
		});

		expect(() => {
			editor.apply(ops);
		}).not.toThrow();

		expect(ops[0]).toEqual({
			type: "splice-text",
			blockId,
			from: 0,
			to: 0,
			insert: "kept",
		});
		expect(editor.getBlock(blockId)!.textContent()).toBe("kept");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_005",
				message: "onBeforeApply hook threw",
			}),
		);

		editor.destroy();
	});

	it("does not let an onBeforeApply hook mutate the caller's nested op fields", () => {
		const editor = createEditor();
		const props = { checked: false };
		const ops: DocumentOp[] = [
			{
				type: "insert-block",
				blockId: "todo-1",
				blockType: "paragraph",
				props,
				position: "last",
			},
		];
		editor.onBeforeApply((incoming) => {
			const first = incoming[0];
			if (first && first.type === "insert-block") {
				first.props.checked = true;
			}
			return incoming;
		});

		editor.apply(ops);

		expect(props).toEqual({ checked: false });
		expect(ops[0]).toEqual({
			type: "insert-block",
			blockId: "todo-1",
			blockType: "paragraph",
			props: { checked: false },
			position: "last",
		});
		expect(editor.getBlock("todo-1")).not.toBeNull();

		editor.destroy();
	});

	it("drops a non-array onBeforeApply return with a diagnostic and still applies", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.onBeforeApply(() => undefined as unknown as DocumentOp[]);

		expect(() => {
			editor.apply([
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "kept",
				},
			]);
		}).not.toThrow();

		expect(editor.getBlock(blockId)!.textContent()).toBe("kept");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_005",
				level: "error",
				source: "apply",
				message: "onBeforeApply hook returned a non-array",
			}),
		);

		editor.destroy();
	});

	it("drops genuinely malformed text ops with a diagnostic and does not throw", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		const commits: CommitEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.on("commit", (event) => {
			commits.push(event);
		});

		expect(() => {
			editor.apply([
				{
					type: "splice-text",
					blockId,
					from: -1,
					to: -1,
					insert: "nope",
				} as DocumentOp,
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: 123,
				} as unknown as DocumentOp,
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0 + Number.NaN,
					insert: "",
				} as DocumentOp,
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "ok",
				},
			]);
		}).not.toThrow();

		expect(editor.getBlock(blockId)!.textContent()).toBe("ok");
		expect(commits).toHaveLength(1);
		expect(
			diagnostics.filter((event) => event.code === "PEN_APPLY_004"),
		).toHaveLength(3);
		expect(commits[0]!.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "PEN_APPLY_004" }),
			]),
		);

		editor.destroy();
	});

	it("drops a splice-text with missing insert with PEN_APPLY_004 and does not throw", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		expect(() => {
			editor.apply([
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
				} as DocumentOp,
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "ok",
				},
			]);
		}).not.toThrow();

		expect(editor.getBlock(blockId)!.textContent()).toBe("ok");
		expect(
			diagnostics.filter((event) => event.code === "PEN_APPLY_004"),
		).toHaveLength(1);

		editor.destroy();
	});

	it("drops a structural op with an empty id with PEN_APPLY_004 and does not throw", () => {
		const editor = createEditor();
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		expect(() => {
			editor.apply([
				{
					type: "insert-block",
					blockId: "",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			]);
		}).not.toThrow();

		expect(editor.getBlock("")).toBeNull();
		expect(
			diagnostics.filter((event) => event.code === "PEN_APPLY_004"),
		).toHaveLength(1);

		editor.destroy();
	});

	it("attaches dropped-op diagnostics to the commit that still applied", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "ok",
			},
			{
				type: "insert-block",
				blockId: "ghost",
				blockType: "not-a-real-block",
				props: {},
				position: "last",
			},
		]);

		expect(commits).toHaveLength(1);
		expect(editor.getBlock(blockId)!.textContent()).toBe("ok");
		expect(editor.getBlock("ghost")).toBeNull();
		expect(commits[0]!.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_002",
				level: "warn",
				source: "apply",
			}),
		);

		editor.destroy();
	});

	it("walks nested children from editor.blocks and documentState.allBlocks", () => {
		const editor = createEditor();
		const rootId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-block",
				blockId: "parent",
				blockType: "toggle",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "child",
				blockType: "paragraph",
				props: {},
				position: { parent: "parent", index: 0 },
			},
			{
				type: "splice-text",
				blockId: "child",
				from: 0,
				to: 0,
				insert: "nested",
			},
		]);

		const fromEditor = [...editor.blocks()].map((block) => block.id);
		const fromState = [...editor.documentState.allBlocks()].map(
			(block) => block.id,
		);

		expect(fromEditor).toEqual(
			expect.arrayContaining([rootId, "parent", "child"]),
		);
		expect(fromState).toEqual(
			expect.arrayContaining([rootId, "parent", "child"]),
		);
		expect(fromEditor).toContain("child");
		expect(editor.getBlock("child")?.textContent()).toBe("nested");
		expect(editor.documentState.blockOrder).not.toContain("child");
		expect(editor.blockCount()).toBe(fromEditor.length);

		// `editor.blocks()` and `documentState.blocks` are the same contract.
		// They drifted apart once, silently, because only `allBlocks()` was
		// compared here; `blockOrder` is the top-level sequence.
		const fromStateBlocks = [...editor.documentState.blocks].map(
			(block) => block.id,
		);
		expect(fromStateBlocks).toEqual(fromEditor);
		expect(fromState).toEqual(fromEditor);
		expect(editor.documentState.blockCount).toBe(editor.blockCount());
		assertPublicTraversalTwins(editor);

		editor.destroy();
	});

	it("walks layout children from editor.blocks and documentState.allBlocks", () => {
		const editor = createEditor({
			schema: createDefaultSchema().extend([
				columns as unknown as BlockSchema,
			]),
		});
		const rootId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-block",
				blockId: "cols",
				blockType: "columns",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "left",
				blockType: "paragraph",
				props: {},
				position: { parent: "cols", index: 0 },
			},
			{
				type: "insert-block",
				blockId: "right",
				blockType: "paragraph",
				props: {},
				position: { parent: "cols", index: 1 },
			},
			{
				type: "splice-text",
				blockId: "left",
				from: 0,
				to: 0,
				insert: "L",
			},
			{
				type: "splice-text",
				blockId: "right",
				from: 0,
				to: 0,
				insert: "R",
			},
		]);

		const fromEditor = [...editor.blocks()].map((block) => block.id);
		const fromState = [...editor.documentState.allBlocks()].map(
			(block) => block.id,
		);

		expect(fromEditor).toEqual(
			expect.arrayContaining([rootId, "cols", "left", "right"]),
		);
		expect(fromState).toEqual(
			expect.arrayContaining([rootId, "cols", "left", "right"]),
		);
		expect(editor.documentState.blockOrder).not.toContain("left");
		expect(editor.documentState.blockOrder).not.toContain("right");
		expect(editor.getBlock("left")!.textContent()).toBe("L");
		expect(editor.getBlock("right")!.textContent()).toBe("R");
		expect(editor.blockCount()).toBe(fromEditor.length);

		const fromStateBlocks = [...editor.documentState.blocks].map(
			(block) => block.id,
		);
		expect(fromStateBlocks).toEqual(fromEditor);
		expect(fromState).toEqual(fromEditor);
		expect(editor.documentState.blockCount).toBe(editor.blockCount());
		assertPublicTraversalTwins(editor);

		editor.destroy();
	});

	it("invokes each onBeforeApply hook once per apply", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		let calls = 0;
		editor.onBeforeApply((ops) => {
			calls += 1;
			return [
				...ops,
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "x",
				},
			];
		});

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "a",
			},
		]);

		expect(calls).toBe(1);
		expect(editor.getBlock(blockId)!.textContent()).toBe("xa");

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "b",
			},
		]);
		expect(calls).toBe(2);

		editor.destroy();
	});

	it("gives onBeforeApply a deterministic snapshot that cannot leak into the next apply", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const seen: string[] = [];
		editor.onBeforeApply((ops) => {
			const first = ops[0];
			if (first && first.type === "splice-text") {
				const insert = first.insert;
				if (typeof insert === "string") {
					seen.push(insert);
					first.insert = "mutated";
				}
			}
			return ops;
		});

		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "one",
			},
		]);
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "two",
			},
		]);

		expect(seen).toEqual(["one", "two"]);
		expect(editor.getBlock(blockId)!.textContent()).toBe("mutatedmutated");

		editor.destroy();
	});

	it("drops a throwing observe() with a diagnostic and still applies", () => {
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "broken-observe",
					observe() {
						throw new Error("observe boom");
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		expect(() => {
			editor.apply([
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "kept",
				},
			]);
		}).not.toThrow();

		expect(editor.getBlock(blockId)!.textContent()).toBe("kept");
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_EXT_001",
				level: "error",
				source: "extension",
				message: 'Extension "broken-observe" observe() threw',
			}),
		);

		editor.destroy();
	});

	it("pins firstBlock and lastBlock against documentState.blockOrder", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "tail",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		expect(editor.firstBlock()?.id).toBe(editor.documentState.blockAt(0));
		expect(editor.firstBlock()?.id).toBe(
			editor.documentState.blockOrder[0],
		);
		expect(editor.lastBlock()?.id).toBe(
			editor.documentState.blockOrder[
				editor.documentState.blockOrder.length - 1
			],
		);
		expect(editor.lastBlock()?.id).toBe("tail");

		editor.destroy();
	});

	it("pins getBlock against the blocks() walk and textContent against blockLogicalText", () => {
		const editor = createEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "parent",
				blockType: "toggle",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "child",
				blockType: "paragraph",
				props: {},
				position: { parent: "parent", index: 0 },
			},
			{
				type: "splice-text",
				blockId: "child",
				from: 0,
				to: 0,
				insert: "nested",
			},
		]);

		assertPublicTraversalTwins(editor);
		expect(editor.documentState.parentOf("child")).toBe("parent");

		editor.destroy();
	});

	it("pins logicalLengthFromStored as stored length", () => {
		const samples = ["", "ab", "keep", "keep\u200Bme"];
		for (const sample of samples) {
			expect(logicalLengthFromStored(sample)).toBe(sample.length);
		}
	});
});

function assertPublicTraversalTwins(editor: Editor): void {
	const fromEditor = [...editor.blocks()];
	const fromState = [...editor.documentState.allBlocks()];
	const fromStateBlocks = [...editor.documentState.blocks];
	const editorIds = fromEditor.map((block) => block.id);
	const stateIds = fromState.map((block) => block.id);
	const stateBlockIds = fromStateBlocks.map((block) => block.id);

	expect(stateIds).toEqual(editorIds);
	expect(stateBlockIds).toEqual(editorIds);
	expect(editor.blockCount()).toBe(fromEditor.length);
	expect(editor.documentState.blockCount).toBe(fromEditor.length);
	expect(editor.firstBlock()?.id).toBe(editor.documentState.blockAt(0));
	expect(editor.lastBlock()?.id).toBe(
		editor.documentState.blockOrder[
			editor.documentState.blockOrder.length - 1
		],
	);

	for (const block of fromEditor) {
		const viaGet = editor.getBlock(block.id);
		expect(viaGet).not.toBeNull();
		expect(viaGet!.id).toBe(block.id);
		expect(blockLogicalText(editor, block.id)).toBe(block.textContent());
		expect(viaGet!.textContent()).toBe(block.textContent());
	}
}
