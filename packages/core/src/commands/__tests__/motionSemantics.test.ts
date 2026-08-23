import { describe, expect, it } from "vitest";

import {
	builtinCommandHandlers,
	caretDown,
	caretLeft,
	caretLineEnd,
	caretLineStart,
	caretRight,
	caretUp,
	caretWordLeft,
	caretWordRight,
	deleteBackward,
	deleteForward,
	isCommandHandlerProvider,
	resolveDefaultKeymap,
	resolveDirectedBinding,
	resolveDirectedCommand,
	resolveFocusBlockDirection,
	serializeDefaultKeymap,
	setVerticalCaretMeasure,
	type DefaultKeymapBinding,
	type KeymapPlatform,
} from "..";
import { caretOf, createCommandEditor, createCommandHarness } from "./fixture";

const ARABIC = "مرحبا";

function bindingNamed(
	platform: KeymapPlatform,
	key: string,
): DefaultKeymapBinding {
	const binding = resolveDefaultKeymap(platform).find((entry) => entry.key === key);
	if (!binding) {
		throw new Error(`missing ${platform} binding ${key}`);
	}
	return binding;
}

function rtlEditor(text = "hello", extra?: { id?: string }) {
	const id = extra?.id ?? "a";
	const editor = createCommandEditor([
		{ id, type: "paragraph", text, props: { direction: "rtl" } },
	]);
	editor.selectText(id, 0, 0);
	return editor;
}

describe("motion semantics M1–M6", () => {
	it("M1: caretLeft/Right stay logical on an rtl block", () => {
		const editor = rtlEditor(ARABIC);
		const registry = createCommandHarness(editor);

		expect(registry.dispatch(caretRight, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 1 });

		expect(registry.dispatch(caretRight, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });

		expect(registry.dispatch(caretLeft, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 1 });

		editor.selectText("a", 0, 0);
		expect(registry.dispatch(caretLeft, { extend: false })).toBe(false);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 0 });
		editor.destroy();
	});

	it("M2 K1: rtl swaps all four arrow bindings and the word variants", () => {
		const editor = rtlEditor("ab");
		expect(resolveFocusBlockDirection(editor)).toBe("rtl");

		const arrowCases: readonly [KeymapPlatform, string, string][] = [
			["macos", "ArrowLeft", caretRight.name],
			["macos", "Shift-ArrowLeft", caretRight.name],
			["macos", "ArrowRight", caretLeft.name],
			["macos", "Shift-ArrowRight", caretLeft.name],
			["windows", "ArrowLeft", caretRight.name],
			["windows", "Shift-ArrowLeft", caretRight.name],
			["windows", "ArrowRight", caretLeft.name],
			["windows", "Shift-ArrowRight", caretLeft.name],
		];
		for (const [platform, key, command] of arrowCases) {
			expect(
				resolveDirectedBinding(editor, bindingNamed(platform, key)).command
					.name,
				`${platform} ${key}`,
			).toBe(command);
		}

		const wordCases: readonly [KeymapPlatform, string, string][] = [
			["macos", "Alt-ArrowLeft", caretWordRight.name],
			["macos", "Shift-Alt-ArrowLeft", caretWordRight.name],
			["macos", "Alt-ArrowRight", caretWordLeft.name],
			["macos", "Shift-Alt-ArrowRight", caretWordLeft.name],
			["windows", "Ctrl-ArrowLeft", caretWordRight.name],
			["windows", "Shift-Ctrl-ArrowLeft", caretWordRight.name],
			["windows", "Ctrl-ArrowRight", caretWordLeft.name],
			["windows", "Shift-Ctrl-ArrowRight", caretWordLeft.name],
		];
		for (const [platform, key, command] of wordCases) {
			expect(
				resolveDirectedBinding(editor, bindingNamed(platform, key)).command
					.name,
				`${platform} ${key}`,
			).toBe(command);
		}

		const registry = createCommandHarness(editor);
		const remapped = resolveDirectedBinding(
			editor,
			bindingNamed("macos", "ArrowLeft"),
		);
		expect(registry.dispatch(remapped.command, remapped.param as { extend: boolean })).toBe(
			true,
		);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 1 });
		editor.destroy();
	});

	it("M2 K1: the default keymap table stays logical; ltr does not swap", () => {
		expect(serializeDefaultKeymap("macos")).toEqual(
			expect.arrayContaining([
				{
					key: "ArrowLeft",
					command: caretLeft.name,
					param: { extend: false },
				},
				{
					key: "ArrowRight",
					command: caretRight.name,
					param: { extend: false },
				},
			]),
		);

		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
		]);
		editor.selectText("a", 0, 0);
		expect(resolveFocusBlockDirection(editor)).toBe("ltr");
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "ArrowLeft"))
				.command.name,
		).toBe(caretLeft.name);
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "Alt-ArrowLeft"))
				.command.name,
		).toBe(caretWordLeft.name);
		editor.destroy();
	});

	it("DIR1: first-strong arabic drives the swap without an explicit prop", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: ARABIC },
		]);
		editor.selectText("a", 0, 0);
		expect(resolveFocusBlockDirection(editor)).toBe("rtl");
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "ArrowLeft"))
				.command.name,
		).toBe(caretRight.name);

		editor.apply(
			[
				{
					type: "delete-text",
					blockId: "a",
					offset: 0,
					length: ARABIC.length,
				},
				{
					type: "insert-text",
					blockId: "a",
					offset: 0,
					text: "Hello",
				},
			],
			{ origin: "user" },
		);
		editor.selectText("a", 0, 0);
		expect(resolveFocusBlockDirection(editor)).toBe("ltr");
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "ArrowLeft"))
				.command.name,
		).toBe(caretLeft.name);
		editor.destroy();
	});

	it("M3: caretLineStart/End stay at logical block edges without a measure; Home/End do not swap", () => {
		const editor = rtlEditor("hello");
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretLineStart, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 0 });
		expect(registry.dispatch(caretLineEnd, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 5 });

		expect(
			resolveDirectedBinding(editor, bindingNamed("windows", "Home")).command
				.name,
		).toBe(caretLineStart.name);
		expect(
			resolveDirectedBinding(editor, bindingNamed("windows", "End")).command
				.name,
		).toBe(caretLineEnd.name);
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "Home")).command
				.name,
		).toBe(caretLineStart.name);
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "End")).command
				.name,
		).toBe(caretLineEnd.name);
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "Meta-ArrowLeft"))
				.command.name,
		).toBe(caretLineStart.name);
		expect(
			resolveDirectedBinding(
				editor,
				bindingNamed("macos", "Shift-Meta-ArrowLeft"),
			).command.name,
		).toBe(caretLineStart.name);
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "Meta-ArrowRight"))
				.command.name,
		).toBe(caretLineEnd.name);
		editor.destroy();
	});

	it("M4: word commands stay logical; only the keymap word bindings swap", () => {
		const editor = rtlEditor("hello world");
		const registry = createCommandHarness(editor);
		editor.selectText("a", 11, 11);

		expect(registry.dispatch(caretWordLeft, { extend: false })).toBe(true);
		expect(caretOf(editor).offset).toBe(6);
		expect(registry.dispatch(caretWordLeft, { extend: false })).toBe(true);
		expect(caretOf(editor).offset).toBe(0);
		expect(registry.dispatch(caretWordRight, { extend: false })).toBe(true);
		expect(caretOf(editor).offset).toBe(5);

		expect(resolveDirectedCommand(caretWordLeft, "rtl")).toBe(caretWordRight);
		expect(resolveDirectedCommand(caretWordRight, "ltr")).toBe(caretWordRight);
		editor.destroy();
	});

	it("M5: vertical motion bindings are not direction-swapped", () => {
		const editor = rtlEditor();
		const vertical: readonly [KeymapPlatform, string, string][] = [
			["macos", "ArrowUp", caretUp.name],
			["macos", "Shift-ArrowUp", caretUp.name],
			["macos", "ArrowDown", caretDown.name],
			["macos", "Shift-ArrowDown", caretDown.name],
			["macos", "Meta-ArrowUp", "pen.caretDocStart"],
			["macos", "Meta-ArrowDown", "pen.caretDocEnd"],
			["windows", "ArrowUp", caretUp.name],
			["windows", "ArrowDown", caretDown.name],
		];
		for (const [platform, key, command] of vertical) {
			expect(
				resolveDirectedBinding(editor, bindingNamed(platform, key)).command
					.name,
				`${platform} ${key}`,
			).toBe(command);
		}

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

		const directions: Array<"up" | "down"> = [];
		setVerticalCaretMeasure(editor, (_ed, current, direction, goalX) => {
			directions.push(direction);
			return { point: current, goalX: goalX ?? 12 };
		});
		const registry = createCommandHarness(editor);
		editor.selectText("a", 0, 0);
		expect(registry.dispatch(caretUp, { extend: false })).toBe(true);
		expect(registry.dispatch(caretDown, { extend: false })).toBe(true);
		expect(directions).toEqual(["up", "down"]);
		editor.destroy();
	});

	it("M6: deletion stays logical and keymap delete bindings do not swap", () => {
		const editor = rtlEditor("ab");
		const deleteCases: readonly [KeymapPlatform, string, string][] = [
			["macos", "Backspace", deleteBackward.name],
			["macos", "Delete", deleteForward.name],
			["macos", "Alt-Backspace", deleteBackward.name],
			["macos", "Alt-Delete", deleteForward.name],
			["windows", "Backspace", deleteBackward.name],
			["windows", "Delete", deleteForward.name],
			["windows", "Ctrl-Backspace", deleteBackward.name],
			["windows", "Ctrl-Delete", deleteForward.name],
		];
		for (const [platform, key, command] of deleteCases) {
			expect(
				resolveDirectedBinding(editor, bindingNamed(platform, key)).command
					.name,
				`${platform} ${key}`,
			).toBe(command);
		}

		const registry = createCommandHarness(editor);
		editor.selectText("a", 1, 1);
		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);
		expect(editor.getBlock("a")?.textContent()).toBe("b");
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 0 });
		editor.destroy();
	});
});
