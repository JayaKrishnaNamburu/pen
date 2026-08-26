import { describe, expect, it } from "vitest";
import { defaultKeymap, type DefaultKeymapBinding } from "../defaultKeymap";

function findBindings(
	table: readonly DefaultKeymapBinding[],
	key: string,
	context?: DefaultKeymapBinding["context"],
): DefaultKeymapBinding[] {
	return table.filter((binding) => {
		if (binding.key !== key) {
			return false;
		}
		if (context === undefined) {
			return binding.context === undefined;
		}
		return binding.context === context;
	});
}

function expectBinding(
	table: readonly DefaultKeymapBinding[],
	expected: DefaultKeymapBinding,
): void {
	expect(findBindings(table, expected.key, expected.context)).toEqual([
		expected,
	]);
}

function modifierKeys(table: readonly DefaultKeymapBinding[]): string[] {
	return table
		.map((binding) => binding.key)
		.filter(
			(key) =>
				key.includes("Mod") ||
				key.includes("Meta") ||
				key.includes("Ctrl"),
		)
		.sort();
}

describe("defaultKeymap", () => {
	it("D-keymap / 4.x: exposes mod, meta, and ctrl platform tables", () => {
		expect(Object.keys(defaultKeymap).sort()).toEqual([
			"ctrl",
			"meta",
			"mod",
		]);
		expect(defaultKeymap.mod.length).toBeGreaterThan(0);
		expect(defaultKeymap.meta.length).toBeGreaterThan(
			defaultKeymap.mod.length,
		);
		expect(defaultKeymap.ctrl.length).toBeGreaterThan(
			defaultKeymap.mod.length,
		);
	});

	it("D-keymap / 4.x: bindings are data only — command names, no handlers", () => {
		const tables = [
			defaultKeymap.mod,
			defaultKeymap.meta,
			defaultKeymap.ctrl,
		];
		for (const table of tables) {
			for (const binding of table) {
				expect(typeof binding.command).toBe("string");
				expect(binding.command.length).toBeGreaterThan(0);
				expect(binding).not.toHaveProperty("handler");
			}
		}
	});

	it("D-keymap / 4.x: mod table keeps Mod- portable shortcuts", () => {
		expectBinding(defaultKeymap.mod, {
			key: "Mod-a",
			command: "pen.selectAll",
		});
		expectBinding(defaultKeymap.mod, {
			key: "Mod-b",
			command: "pen.toggleMark",
			param: { mark: "bold" },
		});
		expectBinding(defaultKeymap.mod, {
			key: "Mod-i",
			command: "pen.toggleMark",
			param: { mark: "italic" },
		});
		expectBinding(defaultKeymap.mod, {
			key: "Mod-u",
			command: "pen.toggleMark",
			param: { mark: "underline" },
		});
		expectBinding(defaultKeymap.mod, {
			key: "Mod-z",
			command: "history.undo",
		});
		expectBinding(defaultKeymap.mod, {
			key: "Shift-Mod-z",
			command: "history.redo",
		});
		expectBinding(defaultKeymap.mod, {
			key: "Mod-y",
			command: "history.redo",
		});

		expect(modifierKeys(defaultKeymap.mod)).toEqual([
			"Mod-a",
			"Mod-b",
			"Mod-i",
			"Mod-u",
			"Mod-y",
			"Mod-z",
			"Shift-Mod-z",
		]);
	});

	it("D-keymap / 4.x: shared arrows, delete, enter, and tab live on every table", () => {
		for (const table of [
			defaultKeymap.mod,
			defaultKeymap.meta,
			defaultKeymap.ctrl,
		]) {
			expectBinding(table, {
				key: "ArrowLeft",
				command: "pen.caretLeft",
				param: { extend: false },
			});
			expectBinding(table, {
				key: "Shift-ArrowLeft",
				command: "pen.caretLeft",
				param: { extend: true },
			});
			expectBinding(table, {
				key: "ArrowRight",
				command: "pen.caretRight",
				param: { extend: false },
			});
			expectBinding(table, {
				key: "Shift-ArrowRight",
				command: "pen.caretRight",
				param: { extend: true },
			});
			expectBinding(table, {
				key: "ArrowUp",
				command: "pen.caretUp",
				param: { extend: false },
			});
			expectBinding(table, {
				key: "Shift-ArrowUp",
				command: "pen.caretUp",
				param: { extend: true },
			});
			expectBinding(table, {
				key: "ArrowDown",
				command: "pen.caretDown",
				param: { extend: false },
			});
			expectBinding(table, {
				key: "Shift-ArrowDown",
				command: "pen.caretDown",
				param: { extend: true },
			});
			expectBinding(table, {
				key: "Backspace",
				command: "pen.deleteBackward",
				param: { granularity: "grapheme" },
			});
			expectBinding(table, {
				key: "Delete",
				command: "pen.deleteForward",
				param: { granularity: "grapheme" },
			});
			expectBinding(table, { key: "Enter", command: "pen.splitBlock" });
			expectBinding(table, {
				key: "Shift-Enter",
				command: "pen.insertLineBreak",
			});
			expectBinding(table, { key: "Tab", command: "pen.indent" });
			expectBinding(table, { key: "Shift-Tab", command: "pen.outdent" });
			expectBinding(table, {
				key: "Tab",
				command: "table.cellNext",
				context: "cell",
			});
			expectBinding(table, {
				key: "Shift-Tab",
				command: "table.cellPrev",
				context: "cell",
			});
			expectBinding(table, {
				key: "Enter",
				command: "table.cellDown",
				context: "cell",
			});
		}
	});

	it("D-keymap / 4.x: meta table resolves Mod to Meta and binds macOS word/line/doc", () => {
		expectBinding(defaultKeymap.meta, {
			key: "Meta-a",
			command: "pen.selectAll",
		});
		expectBinding(defaultKeymap.meta, {
			key: "Meta-b",
			command: "pen.toggleMark",
			param: { mark: "bold" },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Meta-z",
			command: "history.undo",
		});
		expectBinding(defaultKeymap.meta, {
			key: "Shift-Meta-z",
			command: "history.redo",
		});
		expectBinding(defaultKeymap.meta, {
			key: "Meta-y",
			command: "history.redo",
		});
		expectBinding(defaultKeymap.meta, {
			key: "Alt-ArrowLeft",
			command: "pen.caretWordLeft",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Shift-Alt-ArrowLeft",
			command: "pen.caretWordLeft",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Alt-ArrowRight",
			command: "pen.caretWordRight",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Shift-Alt-ArrowRight",
			command: "pen.caretWordRight",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Meta-ArrowLeft",
			command: "pen.caretLineStart",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Shift-Meta-ArrowLeft",
			command: "pen.caretLineStart",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Meta-ArrowRight",
			command: "pen.caretLineEnd",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Meta-ArrowUp",
			command: "pen.caretDocStart",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Meta-ArrowDown",
			command: "pen.caretDocEnd",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Alt-Backspace",
			command: "pen.deleteBackward",
			param: { granularity: "word" },
		});
		expectBinding(defaultKeymap.meta, {
			key: "Alt-Delete",
			command: "pen.deleteForward",
			param: { granularity: "word" },
		});

		expect(findBindings(defaultKeymap.meta, "Mod-a")).toEqual([]);
		expect(findBindings(defaultKeymap.meta, "Home")).toEqual([]);
		expect(findBindings(defaultKeymap.meta, "Ctrl-ArrowLeft")).toEqual([]);
	});

	it("D-keymap / 4.x: ctrl table resolves Mod to Ctrl and binds Home/End plus Ctrl word/doc", () => {
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-a",
			command: "pen.selectAll",
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-b",
			command: "pen.toggleMark",
			param: { mark: "bold" },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-z",
			command: "history.undo",
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Shift-Ctrl-z",
			command: "history.redo",
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-y",
			command: "history.redo",
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-ArrowLeft",
			command: "pen.caretWordLeft",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Shift-Ctrl-ArrowLeft",
			command: "pen.caretWordLeft",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-ArrowRight",
			command: "pen.caretWordRight",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Home",
			command: "pen.caretLineStart",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Shift-Home",
			command: "pen.caretLineStart",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "End",
			command: "pen.caretLineEnd",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Shift-End",
			command: "pen.caretLineEnd",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-Home",
			command: "pen.caretDocStart",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Shift-Ctrl-Home",
			command: "pen.caretDocStart",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-End",
			command: "pen.caretDocEnd",
			param: { extend: false },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Shift-Ctrl-End",
			command: "pen.caretDocEnd",
			param: { extend: true },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-Backspace",
			command: "pen.deleteBackward",
			param: { granularity: "word" },
		});
		expectBinding(defaultKeymap.ctrl, {
			key: "Ctrl-Delete",
			command: "pen.deleteForward",
			param: { granularity: "word" },
		});

		expect(findBindings(defaultKeymap.ctrl, "Mod-a")).toEqual([]);
		expect(findBindings(defaultKeymap.ctrl, "Meta-a")).toEqual([]);
		expect(findBindings(defaultKeymap.ctrl, "Alt-ArrowLeft")).toEqual([]);
	});

	it("D-keymap / 4.x: snapshots resolved bindings per platform", () => {
		expect(defaultKeymap.mod).toEqual([
			{
				key: "ArrowLeft",
				command: "pen.caretLeft",
				param: { extend: false },
			},
			{
				key: "Shift-ArrowLeft",
				command: "pen.caretLeft",
				param: { extend: true },
			},
			{
				key: "ArrowRight",
				command: "pen.caretRight",
				param: { extend: false },
			},
			{
				key: "Shift-ArrowRight",
				command: "pen.caretRight",
				param: { extend: true },
			},
			{
				key: "ArrowUp",
				command: "pen.caretUp",
				param: { extend: false },
			},
			{
				key: "Shift-ArrowUp",
				command: "pen.caretUp",
				param: { extend: true },
			},
			{
				key: "ArrowDown",
				command: "pen.caretDown",
				param: { extend: false },
			},
			{
				key: "Shift-ArrowDown",
				command: "pen.caretDown",
				param: { extend: true },
			},
			{
				key: "Backspace",
				command: "pen.deleteBackward",
				param: { granularity: "grapheme" },
			},
			{
				key: "Delete",
				command: "pen.deleteForward",
				param: { granularity: "grapheme" },
			},
			{ key: "Enter", command: "pen.splitBlock" },
			{ key: "Shift-Enter", command: "pen.insertLineBreak" },
			{ key: "Tab", command: "pen.indent" },
			{ key: "Shift-Tab", command: "pen.outdent" },
			{ key: "Tab", command: "table.cellNext", context: "cell" },
			{ key: "Shift-Tab", command: "table.cellPrev", context: "cell" },
			{ key: "Enter", command: "table.cellDown", context: "cell" },
			{ key: "Mod-a", command: "pen.selectAll" },
			{
				key: "Mod-b",
				command: "pen.toggleMark",
				param: { mark: "bold" },
			},
			{
				key: "Mod-i",
				command: "pen.toggleMark",
				param: { mark: "italic" },
			},
			{
				key: "Mod-u",
				command: "pen.toggleMark",
				param: { mark: "underline" },
			},
			{ key: "Mod-z", command: "history.undo" },
			{ key: "Shift-Mod-z", command: "history.redo" },
			{ key: "Mod-y", command: "history.redo" },
		]);

		expect(defaultKeymap.meta).toHaveLength(defaultKeymap.mod.length + 14);
		expect(defaultKeymap.ctrl).toHaveLength(defaultKeymap.mod.length + 14);
		expect(defaultKeymap.meta.map((binding) => binding.key)).toEqual([
			"ArrowLeft",
			"Shift-ArrowLeft",
			"ArrowRight",
			"Shift-ArrowRight",
			"ArrowUp",
			"Shift-ArrowUp",
			"ArrowDown",
			"Shift-ArrowDown",
			"Backspace",
			"Delete",
			"Enter",
			"Shift-Enter",
			"Tab",
			"Shift-Tab",
			"Tab",
			"Shift-Tab",
			"Enter",
			"Meta-a",
			"Meta-b",
			"Meta-i",
			"Meta-u",
			"Meta-z",
			"Shift-Meta-z",
			"Meta-y",
			"Alt-ArrowLeft",
			"Shift-Alt-ArrowLeft",
			"Alt-ArrowRight",
			"Shift-Alt-ArrowRight",
			"Meta-ArrowLeft",
			"Shift-Meta-ArrowLeft",
			"Meta-ArrowRight",
			"Shift-Meta-ArrowRight",
			"Meta-ArrowUp",
			"Shift-Meta-ArrowUp",
			"Meta-ArrowDown",
			"Shift-Meta-ArrowDown",
			"Alt-Backspace",
			"Alt-Delete",
		]);
		expect(defaultKeymap.ctrl.map((binding) => binding.key)).toEqual([
			"ArrowLeft",
			"Shift-ArrowLeft",
			"ArrowRight",
			"Shift-ArrowRight",
			"ArrowUp",
			"Shift-ArrowUp",
			"ArrowDown",
			"Shift-ArrowDown",
			"Backspace",
			"Delete",
			"Enter",
			"Shift-Enter",
			"Tab",
			"Shift-Tab",
			"Tab",
			"Shift-Tab",
			"Enter",
			"Ctrl-a",
			"Ctrl-b",
			"Ctrl-i",
			"Ctrl-u",
			"Ctrl-z",
			"Shift-Ctrl-z",
			"Ctrl-y",
			"Ctrl-ArrowLeft",
			"Shift-Ctrl-ArrowLeft",
			"Ctrl-ArrowRight",
			"Shift-Ctrl-ArrowRight",
			"Home",
			"Shift-Home",
			"End",
			"Shift-End",
			"Ctrl-Home",
			"Shift-Ctrl-Home",
			"Ctrl-End",
			"Shift-Ctrl-End",
			"Ctrl-Backspace",
			"Ctrl-Delete",
		]);
	});
});
