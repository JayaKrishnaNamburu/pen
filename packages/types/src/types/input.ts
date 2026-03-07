import type { Editor } from "./editor.js";
import type { DocumentOp } from "./ops.js";

export interface KeyBindingContext {
	blockType?: string[];
	hasSelection?: boolean;
	collapsed?: boolean;
	withinLayout?: string[];
}

export interface KeyBinding {
	key: string;
	priority?: number;
	context?: KeyBindingContext;
	description?: string;
	handler: (editor: Editor, event: KeyboardEvent) => boolean;
}

export interface InputRuleContext {
	editor: Editor;
	blockId: string;
	blockType: string;
	textBefore: string;
	fullText: string;
}

export type InputRuleHandler = (
	match: RegExpMatchArray,
	context: InputRuleContext,
) => DocumentOp[] | null;

export interface InputRule {
	id: string;
	match: RegExp;
	blockTypes?: string[];
	handler: InputRuleHandler;
}
