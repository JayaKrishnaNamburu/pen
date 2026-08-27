import type { Command } from "@input/pen-types";

import {
	caretDocEnd,
	caretDocStart,
	caretDown,
	caretLeft,
	caretLineEnd,
	caretLineStart,
	caretRight,
	caretUp,
	caretWordLeft,
	caretWordRight,
	selectAll,
} from "./caret";
import { historyRedo, historyUndo } from "./history";
import { tableCellDown, tableCellNext, tableCellPrev } from "./table";
import {
	deleteBackward,
	deleteForward,
	indent,
	insertLineBreak,
	outdent,
	splitBlock,
	toggleMark,
} from "./text";

export type DefaultKeymapContext = "text" | "cell" | "block" | "any";

export type KeymapPlatform = "macos" | "windows" | "linux";

export interface DefaultKeymapBinding {
	readonly key: string;
	readonly command: Command<unknown>;
	readonly param?: unknown;
	readonly context?: DefaultKeymapContext;
}

export interface SerializedKeymapBinding {
	readonly key: string;
	readonly command: string;
	readonly param?: unknown;
	readonly context?: DefaultKeymapContext;
}

function extendPair(
	key: string,
	command: Command<unknown>,
): [DefaultKeymapBinding, DefaultKeymapBinding] {
	return [
		{ key, command, param: { extend: false } },
		{ key: `Shift-${key}`, command, param: { extend: true } },
	];
}

function resolveMod(
	bindings: readonly DefaultKeymapBinding[],
	modifier: "Meta" | "Ctrl",
): DefaultKeymapBinding[] {
	return bindings.map((binding) => {
		if (!binding.key.includes("Mod")) {
			return binding;
		}
		return {
			...binding,
			key: binding.key.replaceAll("Mod", modifier),
		};
	});
}

const sharedBindings: readonly DefaultKeymapBinding[] = [
	...extendPair("ArrowLeft", caretLeft),
	...extendPair("ArrowRight", caretRight),
	...extendPair("ArrowUp", caretUp),
	...extendPair("ArrowDown", caretDown),
	{
		key: "Backspace",
		command: deleteBackward,
		param: { granularity: "grapheme" },
	},
	{
		key: "Delete",
		command: deleteForward,
		param: { granularity: "grapheme" },
	},
	{ key: "Enter", command: splitBlock },
	{ key: "Shift-Enter", command: insertLineBreak },
	{ key: "Tab", command: indent },
	{ key: "Shift-Tab", command: outdent },
	{ key: "Tab", command: tableCellNext, context: "cell" },
	{ key: "Shift-Tab", command: tableCellPrev, context: "cell" },
	{ key: "Enter", command: tableCellDown, context: "cell" },
	{ key: "Mod-a", command: selectAll },
	{ key: "Mod-b", command: toggleMark, param: { mark: "bold" } },
	{ key: "Mod-i", command: toggleMark, param: { mark: "italic" } },
	{ key: "Mod-u", command: toggleMark, param: { mark: "underline" } },
	{ key: "Mod-z", command: historyUndo },
	{ key: "Shift-Mod-z", command: historyRedo },
	{ key: "Mod-y", command: historyRedo },
];

const macosBindings: readonly DefaultKeymapBinding[] = [
	...extendPair("Alt-ArrowLeft", caretWordLeft),
	...extendPair("Alt-ArrowRight", caretWordRight),
	...extendPair("Meta-ArrowLeft", caretLineStart),
	...extendPair("Meta-ArrowRight", caretLineEnd),
	...extendPair("Home", caretLineStart),
	...extendPair("End", caretLineEnd),
	...extendPair("Meta-ArrowUp", caretDocStart),
	...extendPair("Meta-ArrowDown", caretDocEnd),
	{
		key: "Alt-Backspace",
		command: deleteBackward,
		param: { granularity: "word" },
	},
	{
		key: "Alt-Delete",
		command: deleteForward,
		param: { granularity: "word" },
	},
	{
		key: "Meta-Backspace",
		command: deleteBackward,
		param: { granularity: "line" },
	},
	{
		key: "Ctrl-k",
		command: deleteForward,
		param: { granularity: "line" },
	},
];

const windowsLinuxBindings: readonly DefaultKeymapBinding[] = [
	...extendPair("Ctrl-ArrowLeft", caretWordLeft),
	...extendPair("Ctrl-ArrowRight", caretWordRight),
	...extendPair("Home", caretLineStart),
	...extendPair("End", caretLineEnd),
	...extendPair("Ctrl-Home", caretDocStart),
	...extendPair("Ctrl-End", caretDocEnd),
	{
		key: "Ctrl-Backspace",
		command: deleteBackward,
		param: { granularity: "word" },
	},
	{
		key: "Ctrl-Delete",
		command: deleteForward,
		param: { granularity: "word" },
	},
];

export function resolveDefaultKeymap(
	platform: KeymapPlatform,
): readonly DefaultKeymapBinding[] {
	switch (platform) {
		case "macos":
			return [...resolveMod(sharedBindings, "Meta"), ...macosBindings];
		case "windows":
		case "linux":
			return [
				...resolveMod(sharedBindings, "Ctrl"),
				...windowsLinuxBindings,
			];
		default: {
			const _exhaustive: never = platform;
			return _exhaustive;
		}
	}
}

export function serializeDefaultKeymap(
	platform: KeymapPlatform,
): SerializedKeymapBinding[] {
	return resolveDefaultKeymap(platform).map((binding) => {
		const serialized: SerializedKeymapBinding = {
			key: binding.key,
			command: binding.command.name,
		};
		if (binding.param !== undefined) {
			return binding.context
				? {
						...serialized,
						param: binding.param,
						context: binding.context,
					}
				: { ...serialized, param: binding.param };
		}
		if (binding.context) {
			return { ...serialized, context: binding.context };
		}
		return serialized;
	});
}

export const defaultKeymapBindings = {
	shared: sharedBindings,
	macos: macosBindings,
	windowsLinux: windowsLinuxBindings,
};
