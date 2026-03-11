import type { CRDTEvent } from "./crdt";
import type { BlockSchema, InlineSchema } from "./schema";
import type { KeyBinding, InputRule } from "./input";
import type { DecorationSet } from "./decorations";
import type { DocumentState, Editor } from "./editor";

export interface ServerExtensionContext {
  editor: Editor;
  emit(event: string, payload?: unknown): void;
  getState<T>(name: string): T | undefined;
}

export interface ClientExtensionContext extends ServerExtensionContext {
  dom?: Document;
}

export interface Extension {
  name: string;
  version: string;
  readonly dependencies?: readonly string[];

  activateServer?(ctx: ServerExtensionContext): Promise<void>;
  deactivateServer?(): Promise<void>;

  activateClient?(ctx: ClientExtensionContext): Promise<void>;
  deactivateClient?(): Promise<void>;

  observe?(events: CRDTEvent[], editor: Editor): void;
  decorations?(state: DocumentState, editor: Editor): DecorationSet;

  readonly inputRules?: readonly InputRule[];
  readonly keyBindings?: readonly KeyBinding[];

  state?: ExtensionStateSpec<unknown>;
}

export interface ExtensionStateSpec<T> {
  init(editor: Editor): T;
  apply?(state: T, events: CRDTEvent[], editor: Editor): T;
}
