import type { Importer, ImportOptions, Editor } from "@pen/core";
import { blocksToOps } from "@pen/core";
import { sanitizeHTML } from "./sanitize.js";
import { parseHTML } from "./domAdapter.js";
import { domToBlocks } from "./domToBlocks.js";

export const htmlImporter: Importer<string> = {
  name: "html",
  mimeType: "text/html",

  async import(
    input: string,
    editor: Editor,
    options?: ImportOptions,
  ): Promise<void> {
    const sanitized = sanitizeHTML(input);
    const dom = parseHTML(sanitized);

    const registry = editor.schema;
    const blocks = domToBlocks(dom, registry);

    if (blocks.length === 0) return;

    const ops = blocksToOps(blocks, options);
    editor.apply(ops, { origin: "import", undoGroup: true });
  },
};
