import type { CommitEvent, Editor } from "./editor";
import type { FacetProvider } from "./facets";

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
  readonly facets?: readonly FacetProvider[];

  activateServer?(ctx: ServerExtensionContext): Promise<void>;
  deactivateServer?(): Promise<void>;

  activateClient?(ctx: ClientExtensionContext): Promise<void>;
  deactivateClient?(): Promise<void>;

  observe?(events: readonly CommitEvent[], editor: Editor): void;

  state?: ExtensionStateSpec<unknown>;
}

export interface ExtensionStateSpec<T> {
  init(editor: Editor): T;
  apply?(state: T, events: readonly CommitEvent[], editor: Editor): T;
}
