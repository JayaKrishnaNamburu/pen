import type { Block, SchemaRegistry } from "@pen/core";

export interface ImportMarkdownOptions {
  schema?: SchemaRegistry;
}

export function importMarkdown(
  _markdown: string,
  _options?: ImportMarkdownOptions,
): Block[] {
  throw new Error("Not implemented");
}
