export type DefaultKeymapContext = "text" | "cell" | "block" | "any";

export interface DefaultKeymapBinding {
	readonly key: string;
	readonly command: string;
	readonly param?: unknown;
	readonly context?: DefaultKeymapContext;
}

export interface DefaultKeymap {
	readonly mod: readonly DefaultKeymapBinding[];
	readonly meta: readonly DefaultKeymapBinding[];
	readonly ctrl: readonly DefaultKeymapBinding[];
}

function extendPair(
	key: string,
	command: string,
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
	...extendPair("ArrowLeft", "pen.caretLeft"),
	...extendPair("ArrowRight", "pen.caretRight"),
	...extendPair("ArrowUp", "pen.caretUp"),
	...extendPair("ArrowDown", "pen.caretDown"),
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
	{ key: "Mod-b", command: "pen.toggleMark", param: { mark: "bold" } },
	{ key: "Mod-i", command: "pen.toggleMark", param: { mark: "italic" } },
	{ key: "Mod-u", command: "pen.toggleMark", param: { mark: "underline" } },
	{ key: "Mod-z", command: "history.undo" },
	{ key: "Shift-Mod-z", command: "history.redo" },
	{ key: "Mod-y", command: "history.redo" },
];

const metaBindings: readonly DefaultKeymapBinding[] = [
	...extendPair("Alt-ArrowLeft", "pen.caretWordLeft"),
	...extendPair("Alt-ArrowRight", "pen.caretWordRight"),
	...extendPair("Meta-ArrowLeft", "pen.caretLineStart"),
	...extendPair("Meta-ArrowRight", "pen.caretLineEnd"),
	...extendPair("Meta-ArrowUp", "pen.caretDocStart"),
	...extendPair("Meta-ArrowDown", "pen.caretDocEnd"),
	{
		key: "Alt-Backspace",
		command: "pen.deleteBackward",
		param: { granularity: "word" },
	},
	{
		key: "Alt-Delete",
		command: "pen.deleteForward",
		param: { granularity: "word" },
	},
];

const ctrlBindings: readonly DefaultKeymapBinding[] = [
	...extendPair("Ctrl-ArrowLeft", "pen.caretWordLeft"),
	...extendPair("Ctrl-ArrowRight", "pen.caretWordRight"),
	...extendPair("Home", "pen.caretLineStart"),
	...extendPair("End", "pen.caretLineEnd"),
	...extendPair("Ctrl-Home", "pen.caretDocStart"),
	...extendPair("Ctrl-End", "pen.caretDocEnd"),
	{
		key: "Ctrl-Backspace",
		command: "pen.deleteBackward",
		param: { granularity: "word" },
	},
	{
		key: "Ctrl-Delete",
		command: "pen.deleteForward",
		param: { granularity: "word" },
	},
];

export const defaultKeymap: DefaultKeymap = {
	mod: sharedBindings,
	meta: [...resolveMod(sharedBindings, "Meta"), ...metaBindings],
	ctrl: [...resolveMod(sharedBindings, "Ctrl"), ...ctrlBindings],
};
