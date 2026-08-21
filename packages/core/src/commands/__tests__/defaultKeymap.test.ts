import { describe, expect, it } from "vitest";

import {
	caretDown,
	caretUp,
	commandHandler,
	createCommandRegistry,
	isCommandHandlerProvider,
	resolveDefaultKeymap,
	serializeDefaultKeymap,
	splitBlock,
	type SerializedKeymapBinding,
} from "..";
import { BUILTIN_COMMAND_PRECEDENCE } from "../define";
import { builtinCommandHandlers } from "../builtin";

function names(bindings: readonly SerializedKeymapBinding[]): string[] {
	return bindings.map((binding) => `${binding.key}->${binding.command}`);
}

describe("default keymap K2", () => {
	it("K2: macos resolved bindings match the normative platform table", () => {
		expect(serializeDefaultKeymap("macos")).toMatchSnapshot();
	});

	it("K2: windows resolved bindings match the normative platform table", () => {
		expect(serializeDefaultKeymap("windows")).toMatchSnapshot();
	});

	it("K2: linux resolved bindings match the windows table", () => {
		expect(serializeDefaultKeymap("linux")).toEqual(
			serializeDefaultKeymap("windows"),
		);
		expect(serializeDefaultKeymap("linux")).toMatchSnapshot();
	});

	it("K2: vertical caret bindings stay in the table and now have handlers", () => {
		const macos = serializeDefaultKeymap("macos");
		expect(macos).toEqual(
			expect.arrayContaining([
				{
					key: "ArrowUp",
					command: caretUp.name,
					param: { extend: false },
				},
				{
					key: "Shift-ArrowUp",
					command: caretUp.name,
					param: { extend: true },
				},
				{
					key: "ArrowDown",
					command: caretDown.name,
					param: { extend: false },
				},
				{
					key: "Shift-ArrowDown",
					command: caretDown.name,
					param: { extend: true },
				},
			]),
		);
		expect(
			builtinCommandHandlers().some(
				(provider) =>
					isCommandHandlerProvider(provider) &&
					provider.command.name === caretUp.name,
			),
		).toBe(true);
		expect(
			builtinCommandHandlers().some(
				(provider) =>
					isCommandHandlerProvider(provider) &&
					provider.command.name === caretDown.name,
			),
		).toBe(true);
	});

	it("K2: macos uses Alt/Cmd variants; windows uses Ctrl/Home/End", () => {
		const macos = names(serializeDefaultKeymap("macos"));
		const windows = names(serializeDefaultKeymap("windows"));

		expect(macos).toEqual(
			expect.arrayContaining([
				"Alt-ArrowLeft->pen.caretWordLeft",
				"Meta-ArrowLeft->pen.caretLineStart",
				"Meta-ArrowUp->pen.caretDocStart",
				"Alt-Backspace->pen.deleteBackward",
				"Meta-a->pen.selectAll",
				"Meta-b->pen.toggleMark",
				"Shift-Meta-z->history.redo",
			]),
		);
		expect(windows).toEqual(
			expect.arrayContaining([
				"Ctrl-ArrowLeft->pen.caretWordLeft",
				"Home->pen.caretLineStart",
				"Ctrl-Home->pen.caretDocStart",
				"Ctrl-Backspace->pen.deleteBackward",
				"Ctrl-a->pen.selectAll",
				"Ctrl-y->history.redo",
			]),
		);
		expect(macos.some((entry) => entry.startsWith("Home->"))).toBe(false);
		expect(windows.some((entry) => entry.startsWith("Alt-Arrow"))).toBe(
			false,
		);
	});

	it("K2: an added or dropped binding changes the resolved table length", () => {
		expect(resolveDefaultKeymap("macos")).toHaveLength(38);
		expect(resolveDefaultKeymap("windows")).toHaveLength(38);
	});

	it("D5: built-in text handlers sit at default precedence and yield to high", () => {
		const seen: string[] = [];
		const registry = createCommandRegistry({
			providers: [
				...builtinCommandHandlers(),
				commandHandler(
					splitBlock,
					() => {
						seen.push("override");
						return true;
					},
					"high",
				),
			],
		});

		expect(BUILTIN_COMMAND_PRECEDENCE).toBe("default");
		expect(registry.dispatch(splitBlock, undefined)).toBe(true);
		expect(seen).toEqual(["override"]);
	});
});
