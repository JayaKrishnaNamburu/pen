import type { Editor } from "./editor.js";
import type { DocumentOp } from "./ops.js";

export interface KeyBinding {
  key: string;
  handler: (editor: Editor) => boolean;
  description?: string;
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
  handler: InputRuleHandler;
  blockTypes?: string[];
}
