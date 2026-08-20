import type {
	ApplyOptions,
	CommandHandlerRegistration,
	DecorationSet,
	DocumentOp,
	DocumentState,
	Editor,
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
	| ((state: DocumentState, editor: Editor) => DecorationSet)
	| DecorationSet;

export type ClipboardHandler = unknown;

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

export const readOnlyFacet = defineFacet<boolean, boolean>({
	name: "pen.readOnly",
	combine: (inputs) => inputs.some((value) => value),
});

export const clipboardFacet = defineFacet<
	ClipboardHandler,
	readonly ClipboardHandler[]
>({
	name: "pen.clipboard",
	combine: (inputs) => inputs,
});
