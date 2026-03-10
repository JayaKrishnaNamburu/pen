import type { Importer, ImportOptions, Editor, PendingBlock } from "@pen/core";
import { blocksToOps } from "@pen/core";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { astToBlocks } from "./astToBlocks";
import type { MdastRoot } from "./types";

export function parseMarkdownToBlocks(
  input: string,
  editor: Editor,
): PendingBlock[] {
  const tree = fromMarkdown(input, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

  return astToBlocks(tree as MdastRoot, editor.schema);
}

export const markdownImporter: Importer<string, PendingBlock[]> = {
  name: "markdown",
  mimeType: "text/markdown",
  parse(input: string, editor: Editor): PendingBlock[] {
    return parseMarkdownToBlocks(input, editor);
  },

  import(input: string, editor: Editor, options?: ImportOptions): void {
    const blocks = parseMarkdownToBlocks(input, editor);
    if (blocks.length === 0) return;

    const ops = blocksToOps(blocks, options);

    editor.apply(ops, { origin: "import", undoGroup: true });
  },
};
