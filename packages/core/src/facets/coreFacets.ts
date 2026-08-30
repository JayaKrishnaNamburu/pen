import type {
	ApplyOptions,
	AssetProvider,
	CommandHandlerRegistration,
	DecorationSet,
	DocumentOp,
	DocumentState,
	Editor,
	Importer,
	InputRule,
	KeyBinding,
} from "@input/pen-types";

import { defineFacet } from "./defineFacet";

export type Keymap = readonly KeyBinding[];

export type BeforeApplyHook = (
	ops: DocumentOp[],
	options: ApplyOptions,
) => DocumentOp[];

export type DecorationSource =
	((state: DocumentState, editor: Editor) => DecorationSet) | DecorationSet;

export type ClipboardHandler = {
	readonly html?: Importer;
	readonly markdown?: Importer;
	readonly assets?: AssetProvider;
};

function isClipboardHandlerTable(value: unknown): value is ClipboardHandler {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function mergeClipboardHandlers(
	inputs: readonly ClipboardHandler[],
): ClipboardHandler {
	const merged: {
		html?: Importer;
		markdown?: Importer;
		assets?: AssetProvider;
	} = {};
	for (const input of inputs) {
		if (!isClipboardHandlerTable(input)) {
			continue;
		}
		if (input.html !== undefined) {
			merged.html = input.html;
		}
		if (input.markdown !== undefined) {
			merged.markdown = input.markdown;
		}
		if (input.assets !== undefined) {
			merged.assets = input.assets;
		}
	}
	return merged;
}

export type CommandHandlerTable = {
	readonly [commandName: string]: readonly CommandHandlerRegistration[];
};

export const keymapFacet = defineFacet<Keymap, readonly KeyBinding[]>({
	name: "pen.keymap",
	combine: (inputs) => inputs.flat(),
});

export const beforeApplyFacet = defineFacet<
	BeforeApplyHook,
	readonly BeforeApplyHook[]
>({
	name: "pen.beforeApply",
	combine: (inputs) => inputs,
});

export const decorationsFacet = defineFacet<
	DecorationSource,
	readonly DecorationSource[]
>({
	name: "pen.decorations",
	combine: (inputs) => inputs,
});

export const inputRulesFacet = defineFacet<InputRule, readonly InputRule[]>({
	name: "pen.inputRules",
	combine: (inputs) => inputs,
});

export const commandsFacet = defineFacet<
	CommandHandlerRegistration,
	CommandHandlerTable
>({
	name: "pen.commands",
	combine: (inputs) => {
		const table: Record<string, CommandHandlerRegistration[]> = {};
		for (const registration of inputs) {
			const name = registration.command.name;
			const handlers = table[name];
			if (handlers) {
				handlers.push(registration);
			} else {
				table[name] = [registration];
			}
		}
		return table;
	},
});

export const ariaReadOnlyFacet = defineFacet<boolean, boolean>({
	name: "pen.ariaReadOnly",
	combine: (inputs) => inputs.some((value) => value),
});

export const clipboardFacet = defineFacet<ClipboardHandler, ClipboardHandler>({
	name: "pen.clipboard",
	combine: mergeClipboardHandlers,
});
