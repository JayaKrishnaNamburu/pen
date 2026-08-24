import type {
	DocumentOp,
	DocumentState,
	Editor,
	SelectionState,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
	BUILTIN_COMMAND_PRECEDENCE,
	commandHandler,
	createCommandRegistry,
	defineCommand,
} from "../commands";

const insertHello: DocumentOp = {
	type: "splice-text",
	blockId: "b1",
	from: 0,
				to: 0,
				insert: "hello",
};

const insertWorld: DocumentOp = {
	type: "splice-text",
	blockId: "b1",
	from: 5,
				to: 5,
				insert: " world",
};

const blockSelection = (blockId: string): SelectionState => ({
	type: "block",
	blockIds: [blockId],
});

function createEditorFixture(): {
	editor: Editor;
	documentState: DocumentState;
	selection: SelectionState;
	applyCount: { value: number };
	selectionWrites: number;
} {
	const selection = blockSelection("b1");
	const documentState = { generation: 1 } as DocumentState;
	const applyCount = { value: 0 };
	let selectionWrites = 0;
	const editor = {
		apply() {
			applyCount.value += 1;
		},
		setSelection() {
			selectionWrites += 1;
		},
		getSelection() {
			return selection;
		},
		selection,
		documentState,
	} as unknown as Editor;
	return {
		editor,
		documentState,
		selection,
		applyCount,
		get selectionWrites() {
			return selectionWrites;
		},
	};
}

describe("command registry", () => {
	it("D1: tries handlers for the command name in R1 precedence order", () => {
		const ping = defineCommand("test.ping");
		const other = defineCommand("test.other");
		const seen: string[] = [];

		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, () => {
					seen.push("default");
					return true;
				}, "default"),
				commandHandler(other, () => {
					seen.push("other");
					return true;
				}, "highest"),
				commandHandler(ping, () => {
					seen.push("high-miss");
					return false;
				}, "high"),
				commandHandler(ping, () => {
					seen.push("highest");
					return false;
				}, "highest"),
				commandHandler(ping, () => {
					seen.push("low");
					return true;
				}, "low"),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		expect(seen).toEqual(["highest", "high-miss", "default"]);
	});

	it("D1: returns false when no handler matches the command name", () => {
		const ping = defineCommand("test.ping");
		const other = defineCommand("test.other");
		const registry = createCommandRegistry({
			providers: [
				commandHandler(other, () => true),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(false);
	});

	it("D2: records exactly one apply intent for { ops } and does not call editor.apply", () => {
		const insert = defineCommand("test.insert");
		const fixture = createEditorFixture();
		const registry = createCommandRegistry({
			editor: fixture.editor,
			providers: [
				commandHandler(insert, () => ({ ops: [insertHello] })),
			],
		});

		expect(registry.dispatch(insert, undefined)).toBe(true);
		expect(registry.recordedApplies).toEqual([
			{
				ops: [insertHello],
				options: { origin: { type: "user", intent: "test.insert" } },
			},
		]);
		expect(fixture.applyCount.value).toBe(0);
	});

	it("D2: calls an injected apply hook once and still skips editor.apply", () => {
		const insert = defineCommand("test.insert");
		const fixture = createEditorFixture();
		const hooked: DocumentOp[][] = [];
		const registry = createCommandRegistry({
			editor: fixture.editor,
			apply: (ops) => {
				hooked.push(ops);
			},
			providers: [
				commandHandler(insert, () => ({
					ops: [insertHello],
					options: { undoGroup: true },
				})),
			],
		});

		registry.dispatch(insert, undefined, { origin: "ai" });
		expect(hooked).toEqual([[insertHello]]);
		expect(registry.recordedApplies[0]?.options).toEqual({
			origin: { type: "ai", intent: "test.insert" },
			undoGroup: true,
		});
		expect(fixture.applyCount.value).toBe(0);
	});

	it("D2: records a selection write and treats true as already-handled", () => {
		const move = defineCommand("test.move");
		const done = defineCommand("test.done");
		const next = blockSelection("b2");
		const registry = createCommandRegistry({
			providers: [
				commandHandler(move, () => ({ selection: next })),
				commandHandler(done, () => true),
			],
		});

		expect(registry.dispatch(move, undefined, { fromKeymap: true })).toBe(
			true,
		);
		expect(registry.recordedSelections).toEqual([
			{ selection: next, origin: "keyboard" },
		]);
		expect(registry.dispatch(done, undefined)).toBe(true);
		expect(registry.recordedApplies).toEqual([]);
	});

	it("D2: emits command-double-effect when a handler applies and then returns ops", () => {
		const insert = defineCommand("test.insert");
		const registry = createCommandRegistry({
			providers: [
				commandHandler(insert, (editor) => {
					editor.apply([insertHello]);
					return { ops: [insertWorld] };
				}),
			],
		});

		expect(registry.dispatch(insert, undefined)).toBe(true);
		expect(registry.recordedApplies).toEqual([
			{
				ops: [insertHello],
				options: { origin: { type: "user", intent: "test.insert" } },
			},
		]);
		expect(registry.diagnostics).toEqual([
			expect.objectContaining({
				code: "command-double-effect",
				source: "commands",
			}),
		]);
	});

	it("D3: queues nested dispatch until the current handler returns", () => {
		const outer = defineCommand("test.outer");
		const inner = defineCommand("test.inner");
		const order: string[] = [];
		let registry = createCommandRegistry();

		registry = createCommandRegistry({
			providers: [
				commandHandler(outer, () => {
					order.push("outer-start");
					const queued = registry.dispatch(inner, undefined);
					order.push("outer-end");
					expect(queued).toBe(true);
					return { ops: [insertHello] };
				}),
				commandHandler(inner, () => {
					order.push("inner");
					return { ops: [insertWorld] };
				}),
			],
		});

		expect(registry.dispatch(outer, undefined)).toBe(true);
		expect(order).toEqual(["outer-start", "outer-end", "inner"]);
		expect(registry.recordedApplies.map((entry) => entry.ops)).toEqual([
			[insertHello],
			[insertWorld],
		]);
	});

	it("D4: probe apply and selection writes record intent without executing", () => {
		const fixture = createEditorFixture();
		const registry = createCommandRegistry({ editor: fixture.editor });
		const probe = registry.probe();
		const next = blockSelection("probe");

		probe.apply([insertHello]);
		probe.setSelection(next);

		expect(fixture.applyCount.value).toBe(0);
		expect(fixture.selectionWrites).toBe(0);
		expect(probe.documentState).toBe(fixture.documentState);
		expect(probe.getSelection()).toBe(fixture.selection);
		expect(registry.recordedApplies).toEqual([]);
		expect(registry.recordedSelections).toEqual([]);
	});

	it("D4: canDispatch leaves document and selection identity untouched", () => {
		const insert = defineCommand("test.insert");
		const fixture = createEditorFixture();
		const registry = createCommandRegistry({
			editor: fixture.editor,
			providers: [
				commandHandler(insert, (editor) => {
					editor.apply([insertHello]);
					editor.setSelection(blockSelection("mutated"));
					return { ops: [insertWorld] };
				}),
			],
		});

		const beforeDocument = fixture.editor.documentState;
		const beforeSelection = fixture.editor.getSelection();

		expect(registry.canDispatch(insert, undefined)).toBe(true);
		expect(fixture.editor.documentState).toBe(beforeDocument);
		expect(fixture.editor.getSelection()).toBe(beforeSelection);
		expect(fixture.applyCount.value).toBe(0);
		expect(fixture.selectionWrites).toBe(0);
		expect(registry.recordedApplies).toEqual([]);
		expect(registry.recordedSelections).toEqual([]);
	});

	it("D5: built-in default-precedence registrations yield to high overrides", () => {
		const split = defineCommand("pen.splitBlock");
		const seen: string[] = [];
		const registry = createCommandRegistry({
			providers: [
				commandHandler(split, () => {
					seen.push("builtin");
					return true;
				}),
				commandHandler(
					split,
					() => {
						seen.push("override");
						return true;
					},
					"high",
				),
			],
		});

		expect(BUILTIN_COMMAND_PRECEDENCE).toBe("default");
		expect(registry.dispatch(split, undefined)).toBe(true);
		expect(seen).toEqual(["override"]);
	});
});
