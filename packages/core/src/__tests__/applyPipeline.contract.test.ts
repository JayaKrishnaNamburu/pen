import type {
	BlockSchema,
	CommitEvent,
	DiagnosticEvent,
	DocumentOp,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { defineBlock } from "../schema/defineBlock";
import { createDefaultSchema } from "./fixtures/testSchema";
import { createEditor as createCoreEditor } from "../index";

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

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
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
					type: "insert-text",
					blockId,
					offset: 0,
					text: "hello",
				},
			],
			{ origin },
		);

		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin).toBe(origin);
		expect(commits[0]!.source).toBe("apply");
		expect(txnOrigins.length).toBeGreaterThan(0);
		expect(txnOrigins[0]).toBe(origin);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello",
		);

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
					type: "insert-text",
					blockId,
					offset: 0,
					text: "peer",
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
					type: "insert-text",
					blockId,
					offset: 0,
					text: "kept",
				},
			]);
		}).not.toThrow();

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"kept",
		);
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
				type: "insert-text",
				blockId,
				offset: 0,
				text: "kept",
			},
		];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.onBeforeApply((incoming) => {
			incoming[0] = {
				type: "insert-text",
				blockId,
				offset: 0,
				text: "pwned",
			};
			throw new Error("hook boom");
		});

		expect(() => {
			editor.apply(ops);
		}).not.toThrow();

		expect(ops[0]).toEqual({
			type: "insert-text",
			blockId,
			offset: 0,
			text: "kept",
		});
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"kept",
		);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: "PEN_APPLY_005",
				message: "onBeforeApply hook threw",
			}),
		);

		editor.destroy();
	});

	it("drops a non-array onBeforeApply return with a diagnostic and still applies", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.onBeforeApply(
			() => undefined as unknown as DocumentOp[],
		);

		expect(() => {
			editor.apply([
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "kept",
				},
			]);
		}).not.toThrow();

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"kept",
		);
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
					type: "insert-text",
					blockId,
					offset: -1,
					text: "nope",
				} as DocumentOp,
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: 123,
				} as unknown as DocumentOp,
				{
					type: "delete-text",
					blockId,
					offset: 0,
					length: Number.NaN,
				} as DocumentOp,
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "ok",
				},
			]);
		}).not.toThrow();

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("ok");
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

	it("attaches dropped-op diagnostics to the commit that still applied", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "ok",
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
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("ok");
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
				type: "insert-text",
				blockId: "child",
				offset: 0,
				text: "nested",
			},
		]);

		const fromEditor = [...editor.blocks()].map((block) => block.id);
		const fromState = [...editor.documentState.allBlocks()].map(
			(block) => block.id,
		);

		expect(fromEditor).toEqual(expect.arrayContaining([rootId, "parent", "child"]));
		expect(fromState).toEqual(expect.arrayContaining([rootId, "parent", "child"]));
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
		expect(editor.documentState.blockCount).toBe(editor.blockCount());

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
				type: "insert-text",
				blockId: "left",
				offset: 0,
				text: "L",
			},
			{
				type: "insert-text",
				blockId: "right",
				offset: 0,
				text: "R",
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
		expect(visibleText(editor.getBlock("left")!.textContent())).toBe("L");
		expect(visibleText(editor.getBlock("right")!.textContent())).toBe("R");
		expect(editor.blockCount()).toBe(fromEditor.length);

		editor.destroy();
	});
});
