import type { Block, SchemaRegistry } from "@pen/core";

export interface ImportHTMLOptions {
  schema?: SchemaRegistry;
  sanitize?: boolean;
}

export function importHTML(
  _html: string,
  _options?: ImportHTMLOptions,
): Block[] {
  throw new Error("Not implemented");
}
