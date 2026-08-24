import { describe, expect, it } from "vitest";
import {
	caretDown,
	caretLeft,
	caretRight,
	caretUp,
	caretWordLeft,
	caretWordRight,
	createHeadlessEditor,
	deleteBackward,
	deleteForward,
	getCommandRegistry,
	resolveDefaultKeymap,
	resolveDirectedBinding,
	resolveFocusBlockDirection,
	type KeymapPlatform,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { Editor, TextSelection } from "@input/pen-types";

import {
	resolveKeymap,
	type KeymapBinding,
	type KeymapEvent,
} from "../../field-editor/keymap";
import { computeBidiRuns, type BidiRun } from "../levels";

/**
 * LTR-first mixed paragraph: Latin, Arabic, digits, Latin.
 * Digits sit between two strong runs (BR1 / UAX#9 EN).
 */
const MIXED_LTR_FIRST = "Hello, مرحبا 42 world";

/**
 * RTL-first mixed paragraph: Arabic, Latin+digits, Arabic.
 * The LTR embed sits between two RTL strong runs.
 */
const MIXED_RTL_FIRST = "مرحبا, Hello 42 عالم";

const directedMotionBindings: readonly KeymapBinding[] = [
	binding("Shift-ArrowLeft", "pen.caretLeft"),
	binding("ArrowLeft", "pen.caretLeft"),
	binding("Shift-ArrowRight", "pen.caretRight"),
	binding("ArrowRight", "pen.caretRight"),
	binding("Shift-Alt-ArrowLeft", "pen.caretWordLeft"),
	binding("Alt-ArrowLeft", "pen.caretWordLeft"),
	binding("Shift-Alt-ArrowRight", "pen.caretWordRight"),
	binding("Alt-ArrowRight", "pen.caretWordRight"),
	binding("Shift-Ctrl-ArrowLeft", "pen.caretWordLeft"),
	binding("Ctrl-ArrowLeft", "pen.caretWordLeft"),
	binding("Shift-Ctrl-ArrowRight", "pen.caretWordRight"),
	binding("Ctrl-ArrowRight", "pen.caretWordRight"),
	binding("Shift-ArrowUp", "pen.caretUp"),
	binding("ArrowUp", "pen.caretUp"),
	binding("Shift-ArrowDown", "pen.caretDown"),
	binding("ArrowDown", "pen.caretDown"),
	binding("Backspace", "pen.deleteBackward"),
	binding("Delete", "pen.deleteForward"),
	binding("Alt-Backspace", "pen.deleteBackward"),
	binding("Alt-Delete", "pen.deleteForward"),
	binding("Ctrl-Backspace", "pen.deleteBackward"),
	binding("Ctrl-Delete", "pen.deleteForward"),
];

function binding(key: string, name: string): KeymapBinding {
	return { key, command: { name } };
}

function keyEvent(
	key: string,
	mods: Omit<KeymapEvent, "key"> = {},
): KeymapEvent {
	return {
		key,
		altKey: mods.altKey ?? false,
		ctrlKey: mods.ctrlKey ?? false,
		metaKey: mods.metaKey ?? false,
		shiftKey: mods.shiftKey ?? false,
	};
}

function createMixedEditor(
	text: string,
	direction?: "ltr" | "rtl" | "auto",
): { editor: Editor; blockId: string } {
	const editor = createHeadlessEditor({ schema: defaultSchema });
	const blockId = editor.firstBlock()!.id;
	editor.apply(
		[
			{ type: "splice-text", blockId, from: 0, to: 0, insert: text },
			...(direction
				? [
						{
							type: "set-props" as const,
							blockId,
							props: { direction },
						},
					]
				: []),
		],
		{ origin: "user" },
	);
	editor.selectText(blockId, 0, 0);
	return { editor, blockId };
}

function liveText(editor: Editor): TextSelection {
	const selection = editor.selection;
	if (!selection || selection.type !== "text") {
		throw new Error(`expected text selection, got ${selection?.type ?? "null"}`);
	}
	return selection;
}

function logicalRuns(text: string, base: "ltr" | "rtl"): BidiRun[] {
	return [...computeBidiRuns(text, base)].sort((a, b) => a.from - b.from);
}

function bindingNamed(platform: KeymapPlatform, key: string) {
	const found = resolveDefaultKeymap(platform).find((entry) => entry.key === key);
	if (!found) {
		throw new Error(`missing ${platform} binding ${key}`);
	}
	return found;
}

function requireDirection(editor: Editor, expected: "ltr" | "rtl"): "ltr" | "rtl" {
	const direction = resolveFocusBlockDirection(editor);
	expect(direction).toBe(expected);
	if (direction !== expected) {
		throw new Error(`expected ${expected} focus direction, got ${direction}`);
	}
	return direction;
}

function resolveKey(
	event: KeymapEvent,
	direction: "ltr" | "rtl",
): string | null {
	return resolveKeymap(directedMotionBindings, event, {
		composing: false,
		direction,
	});
}

describe("bidi motion semantics M2/M5/M6", () => {
	it("Wave 5 entry gate: caretRight writes affinity onto live editor.selection", () => {
		const { editor } = createMixedEditor(MIXED_RTL_FIRST);
		const before = liveText(editor);
		expect(Object.hasOwn(before, "affinity")).toBe(true);
		expect(before.affinity).toBe("downstream");

		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("createHeadlessEditor did not install a command registry");
		}
		expect(registry.dispatch(caretRight, { extend: false })).toBe(true);

		const after = liveText(editor);
		expect(Object.hasOwn(after, "affinity")).toBe(true);
		expect(after.affinity).toBe("downstream");
		expect(after.focus.offset).toBe(1);
		editor.destroy();
	});

	it("M2: first-strong rtl mixed block swaps ArrowLeft/Right ± Shift and word variants", () => {
		expect(logicalRuns(MIXED_RTL_FIRST, "rtl")).toEqual([
			{ from: 0, to: 7, level: 1 },
			{ from: 7, to: 15, level: 2 },
			{ from: 15, to: 20, level: 1 },
		]);

		const { editor, blockId } = createMixedEditor(MIXED_RTL_FIRST);
		const direction = requireDirection(editor, "rtl");

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

		expect(resolveKey(keyEvent("ArrowLeft"), direction)).toBe("pen.caretRight");
		expect(
			resolveKey(keyEvent("ArrowLeft", { shiftKey: true }), direction),
		).toBe("pen.caretRight");
		expect(resolveKey(keyEvent("ArrowRight"), direction)).toBe("pen.caretLeft");
		expect(
			resolveKey(keyEvent("ArrowRight", { shiftKey: true }), direction),
		).toBe("pen.caretLeft");
		expect(
			resolveKey(keyEvent("ArrowLeft", { altKey: true }), direction),
		).toBe("pen.caretWordRight");
		expect(
			resolveKey(keyEvent("ArrowRight", { altKey: true }), direction),
		).toBe("pen.caretWordLeft");
		expect(
			resolveKey(keyEvent("ArrowLeft", { ctrlKey: true }), direction),
		).toBe("pen.caretWordRight");
		expect(
			resolveKey(keyEvent("ArrowRight", { ctrlKey: true }), direction),
		).toBe("pen.caretWordLeft");

		const remapped = resolveDirectedBinding(
			editor,
			bindingNamed("macos", "ArrowLeft"),
		);
		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("createHeadlessEditor did not install a command registry");
		}
		expect(
			registry.dispatch(
				remapped.command,
				remapped.param as { extend: boolean },
			),
		).toBe(true);
		expect(liveText(editor).focus).toEqual({ blockId, offset: 1 });
		editor.destroy();
	});

	it("M2: first-strong ltr mixed block leaves ArrowLeft/Right and word variants unswapped", () => {
		expect(logicalRuns(MIXED_LTR_FIRST, "ltr")).toEqual([
			{ from: 0, to: 7, level: 0 },
			{ from: 7, to: 13, level: 1 },
			{ from: 13, to: 15, level: 2 },
			{ from: 15, to: 21, level: 0 },
		]);

		const { editor } = createMixedEditor(MIXED_LTR_FIRST);
		const direction = requireDirection(editor, "ltr");

		const cases: readonly [KeymapPlatform, string, string][] = [
			["macos", "ArrowLeft", caretLeft.name],
			["macos", "Shift-ArrowLeft", caretLeft.name],
			["macos", "ArrowRight", caretRight.name],
			["macos", "Shift-ArrowRight", caretRight.name],
			["macos", "Alt-ArrowLeft", caretWordLeft.name],
			["macos", "Alt-ArrowRight", caretWordRight.name],
			["windows", "ArrowLeft", caretLeft.name],
			["windows", "Ctrl-ArrowLeft", caretWordLeft.name],
		];
		for (const [platform, key, command] of cases) {
			expect(
				resolveDirectedBinding(editor, bindingNamed(platform, key)).command
					.name,
				`${platform} ${key}`,
			).toBe(command);
		}

		expect(resolveKey(keyEvent("ArrowLeft"), direction)).toBe("pen.caretLeft");
		expect(resolveKey(keyEvent("ArrowRight"), direction)).toBe(
			"pen.caretRight",
		);
		editor.destroy();
	});

	it("M2: explicit rtl prop swaps even when first-strong is latin", () => {
		const { editor } = createMixedEditor(MIXED_LTR_FIRST, "rtl");
		const direction = requireDirection(editor, "rtl");
		expect(
			resolveDirectedBinding(editor, bindingNamed("macos", "ArrowLeft"))
				.command.name,
		).toBe(caretRight.name);
		expect(resolveKey(keyEvent("ArrowLeft"), direction)).toBe(
			"pen.caretRight",
		);
		editor.destroy();
	});

	it("M5: rtl mixed block does not swap vertical caret commands", () => {
		const { editor } = createMixedEditor(MIXED_RTL_FIRST);
		const direction = requireDirection(editor, "rtl");

		const vertical: readonly [KeymapPlatform, string, string][] = [
			["macos", "ArrowUp", caretUp.name],
			["macos", "Shift-ArrowUp", caretUp.name],
			["macos", "ArrowDown", caretDown.name],
			["macos", "Shift-ArrowDown", caretDown.name],
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

		expect(resolveKey(keyEvent("ArrowUp"), direction)).toBe("pen.caretUp");
		expect(
			resolveKey(keyEvent("ArrowUp", { shiftKey: true }), direction),
		).toBe("pen.caretUp");
		expect(resolveKey(keyEvent("ArrowDown"), direction)).toBe("pen.caretDown");
		expect(
			resolveKey(keyEvent("ArrowDown", { shiftKey: true }), direction),
		).toBe("pen.caretDown");
		editor.destroy();
	});

	it("M6: rtl mixed block does not swap deletion commands", () => {
		const { editor, blockId } = createMixedEditor(MIXED_RTL_FIRST);
		const direction = requireDirection(editor, "rtl");

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

		expect(resolveKey(keyEvent("Backspace"), direction)).toBe(
			"pen.deleteBackward",
		);
		expect(resolveKey(keyEvent("Delete"), direction)).toBe("pen.deleteForward");
		expect(
			resolveKey(keyEvent("Backspace", { altKey: true }), direction),
		).toBe("pen.deleteBackward");
		expect(
			resolveKey(keyEvent("Delete", { ctrlKey: true }), direction),
		).toBe("pen.deleteForward");

		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("createHeadlessEditor did not install a command registry");
		}
		editor.selectText(blockId, 1, 1);
		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);
		const deletedBackward = MIXED_RTL_FIRST.slice(1);
		const deletedForward =
			MIXED_RTL_FIRST.slice(0, 1) + MIXED_RTL_FIRST.slice(2);
		expect(deletedBackward).not.toBe(deletedForward);
		expect(editor.getBlock(blockId)?.textContent()).toBe(deletedBackward);
		expect(editor.getBlock(blockId)?.textContent()).not.toBe(deletedForward);
		expect(liveText(editor).focus.offset).toBe(0);
		editor.destroy();
	});
});
