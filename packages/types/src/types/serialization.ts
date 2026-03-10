import type { BlockHandle } from "./handles";
import type { Editor } from "./editor";
import type { Position } from "./ops";

export interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  value?: string;
  attributes?: Record<string, unknown>;
}

export interface HTMLImportTextNode {
  type: "text";
  textContent: string;
}

export interface HTMLImportElement {
  type: "element";
  tagName: string;
  attributes: Record<string, string>;
  children: HTMLImportNode[];
  textContent?: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
}

export type HTMLImportNode = HTMLImportElement | HTMLImportTextNode;

export interface XMLElement {
  tagName: string;
  attributes: Record<string, string>;
  children: XMLElement[];
  textContent?: string;
}

export interface Exporter<Output = string> {
  name: string;
  mimeType: string;
  fileExtension: string;
  export(editor: Editor, options?: ExportOptions): Output | Promise<Output>;
  exportFragment?(blocks: BlockHandle[], options?: ExportOptions): Output;
}

export interface ExportOptions<
  Extra extends Record<string, unknown> = Record<string, never>,
> {
  includeApps?: boolean;
  includeLayout?: boolean;
  includeMetadata?: boolean;
  includeSuggestions?: boolean;
  prettyPrint?: boolean;
  extra?: Extra;
}

export interface Importer<Input = string, Parsed = unknown> {
  name: string;
  mimeType: string;
  parse?(input: Input, editor: Editor): Parsed | Promise<Parsed>;
  import(
    input: Input,
    editor: Editor,
    options?: ImportOptions,
  ): void | Promise<void>;
}

export interface ImportOptions {
  position?: Position;
  replace?: boolean;
  validate?: boolean;
  normalize?: boolean;
}
