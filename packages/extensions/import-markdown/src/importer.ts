import type { Importer, ImportOptions, Editor } from "@pen/core";
import { blocksToOps } from "@pen/core";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { astToBlocks } from "./astToBlocks.js";
import type { MdastRoot } from "./types.js";

export const markdownImporter: Importer<string> = {
  name: "markdown",
  mimeType: "text/markdown",

  import(input: string, editor: Editor, options?: ImportOptions): void {
    const tree = fromMarkdown(input, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    });

    const registry = editor.schema;
    const blocks = astToBlocks(tree as MdastRoot, registry);

    if (blocks.length === 0) return;

    const ops = blocksToOps(blocks, options);

    editor.apply(ops, { origin: "import", undoGroup: true });
  },
};
