import type { CommandResult, DocumentOp, Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
	commandHandler,
	createCommandRegistry,
	defineCommand,
	splitBlock,
} from "..";
import { caretOf, createCommandEditor, createCommandHarness } from "./fixture";

function insertAt(blockId: string, offset: number, text: string): DocumentOp {
	return {
		type: "insert-text",
		blockId,
		offset,
		text,
	};
}

function headingOnlySplitOverride(editor: Editor): CommandResult | false {
	const selection = editor.selection;
	if (!selection || selection.type !== "text") {
		return false;
	}
	const block = editor.getBlock(selection.focus.blockId);
	if (!block || block.type !== "heading") {
		return false;
	}
	return {
		ops: [insertAt(block.id, selection.focus.offset, "|")],
	};
}

function blockIds(editor: Editor): string[] {
	return [...editor.documentState.blockOrder];
}

describe("command registry dispatch", () => {
	it("D5: a high handler overrides pen.splitBlock in one block type and leaves the default elsewhere", () => {
		const editor = createCommandEditor([
			{ id: "h", type: "heading", text: "Title", props: { level: 2 } },
			{ id: "p", type: "paragraph", text: "Hello" },
		]);
		const registry = createCommandHarness(editor, [
			commandHandler(splitBlock, headingOnlySplitOverride, "high"),
		]);

		editor.selectText("h", 5, 5);
		expect(registry.dispatch(splitBlock, undefined)).toBe(true);
		expect(editor.getBlock("h")?.textContent()).toBe("Title|");
		expect(blockIds(editor)).toEqual(["h", "p"]);

		editor.selectText("p", 2, 2);
		expect(registry.dispatch(splitBlock, undefined)).toBe(true);
		expect(editor.getBlock("p")?.textContent()).toBe("He");
		const next = caretOf(editor);
		expect(next.offset).toBe(0);
		expect(next.blockId).not.toBe("p");
		expect(editor.getBlock(next.blockId)?.type).toBe("paragraph");
		expect(editor.getBlock(next.blockId)?.textContent()).toBe("llo");
		expect(editor.getBlock("h")?.textContent()).toBe("Title|");
		editor.destroy();
	});

	it("D1: a highest miss falls through so the next handler's document effect lands", () => {
		const ping = defineCommand("test.ping");
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hi" },
		]);
		const seen: string[] = [];
		const registry = createCommandRegistry({
			editor,
			providers: [
				commandHandler(
					ping,
					() => {
						seen.push("highest");
						return false;
					},
					"highest",
				),
				commandHandler(ping, () => {
					seen.push("default");
					return {
						ops: [insertAt("a", 2, "DEFAULT")],
					};
				}),
			],
			apply: (ops, options) => {
				editor.apply(ops, options);
			},
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		expect(seen).toEqual(["highest", "default"]);
		expect(editor.getBlock("a")?.textContent()).toBe("hiDEFAULT");
		editor.destroy();
	});

	it("D1: a handled result stops later handlers so their ops never land", () => {
		const ping = defineCommand("test.ping");
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hi" },
		]);
		const seen: string[] = [];
		const registry = createCommandRegistry({
			editor,
			providers: [
				commandHandler(
					ping,
					() => {
						seen.push("highest");
						return {
							ops: [insertAt("a", 2, "HIGHEST")],
						};
					},
					"highest",
				),
				commandHandler(ping, () => {
					seen.push("default");
					return {
						ops: [insertAt("a", 2, "DEFAULT")],
					};
				}),
			],
			apply: (ops, options) => {
				editor.apply(ops, options);
			},
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		expect(seen).toEqual(["highest"]);
		expect(editor.getBlock("a")?.textContent()).toBe("hiHIGHEST");
		editor.destroy();
	});

	it("D1: handlers run highest-to-lowest and stop at the first non-miss", () => {
		const ping = defineCommand("test.ping");
		const seen: string[] = [];
		const miss = (label: string) => () => {
			seen.push(label);
			return false as const;
		};
		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, miss("lowest"), "lowest"),
				commandHandler(ping, miss("default"), "default"),
				commandHandler(ping, miss("high"), "high"),
				commandHandler(
					ping,
					() => {
						seen.push("low");
						return true;
					},
					"low",
				),
				commandHandler(ping, miss("highest"), "highest"),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		expect(seen).toEqual(["highest", "high", "default", "low"]);
	});

	it("D1: same-precedence handlers keep registration order and fall through on miss", () => {
		const ping = defineCommand("test.ping");
		const seen: string[] = [];
		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, () => {
					seen.push("first");
					return false;
				}),
				commandHandler(ping, () => {
					seen.push("second");
					return true;
				}),
				commandHandler(ping, () => {
					seen.push("third");
					return true;
				}),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(true);
		expect(seen).toEqual(["first", "second"]);
	});

	it("D1: dispatch and canDispatch are false when every handler misses", () => {
		const ping = defineCommand("test.ping");
		const other = defineCommand("test.other");
		const registry = createCommandRegistry({
			providers: [
				commandHandler(ping, () => false, "highest"),
				commandHandler(ping, () => false),
				commandHandler(other, () => true, "highest"),
			],
		});

		expect(registry.dispatch(ping, undefined)).toBe(false);
		expect(registry.canDispatch(ping, undefined)).toBe(false);
		expect(registry.dispatch(other, undefined)).toBe(true);
	});
});

describe("command registry probe", () => {
	it("D4: probe apply and selection writes are swallowed on a live document", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
		]);
		editor.selectText("a", 2, 2);
		const registry = createCommandHarness(editor);
		const probe = registry.probe();
		const beforeSelection = editor.selection;

		expect(probe.documentState).toBe(editor.documentState);
		expect(probe.getBlock("a")?.textContent()).toBe("hello");

		probe.apply([insertAt("a", 2, "XXX")], { origin: "user" });
		probe.setSelection({ type: "block", blockIds: ["a"] });
		probe.selectText("a", 0, 5);
		probe.selectTextRange(
			{ blockId: "a", offset: 0 },
			{ blockId: "a", offset: 5 },
		);
		probe.selectBlocks(["a"]);
		probe.replaceSelection("YYY");
		probe.deleteSelection();

		expect(editor.getBlock("a")?.textContent()).toBe("hello");
		expect(editor.selection).toEqual(beforeSelection);
		expect(editor.documentState).toBe(probe.documentState);
		expect(registry.recordedApplies).toEqual([]);
		expect(registry.recordedSelections).toEqual([]);
		editor.destroy();
	});

	it("D4: canDispatch swallows a handler that applies and writes selection", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
		]);
		editor.selectText("a", 2, 2);
		const beforeSelection = editor.selection;
		const ping = defineCommand("test.hostile");
		const registry = createCommandRegistry({
			editor,
			providers: [
				commandHandler(ping, (probeEditor) => {
					probeEditor.apply([insertAt("a", 0, "NOPE")], {
						origin: "user",
					});
					probeEditor.selectText("a", 0, 4);
					probeEditor.setSelection({
						type: "block",
						blockIds: ["a"],
					});
					return true;
				}),
			],
			apply: (ops, options) => {
				editor.apply(ops, options);
			},
			setSelection: (selection) => {
				editor.setSelection(selection);
			},
		});

		expect(registry.canDispatch(ping, undefined)).toBe(true);
		expect(editor.getBlock("a")?.textContent()).toBe("hello");
		expect(editor.selection).toEqual(beforeSelection);
		expect(registry.recordedApplies).toEqual([]);
		expect(registry.recordedSelections).toEqual([]);
		editor.destroy();
	});

	it("D4: canDispatch is true when a later handler would handle after an earlier miss", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
		]);
		const registry = createCommandHarness(editor, [
			commandHandler(splitBlock, () => false, "highest"),
		]);
		editor.selectText("a", 2, 2);

		expect(registry.canDispatch(splitBlock, undefined)).toBe(true);
		expect(editor.getBlock("a")?.textContent()).toBe("hello");
		expect(blockIds(editor)).toEqual(["a"]);
		editor.destroy();
	});
});
