import type { BlockHandle } from "./handles.js";
import type { Editor } from "./editor.js";
import type { Position } from "./ops.js";

export interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
  value?: string;
  attributes?: Record<string, unknown>;
}

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

export interface Importer<Input = string> {
  name: string;
  mimeType: string;
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
