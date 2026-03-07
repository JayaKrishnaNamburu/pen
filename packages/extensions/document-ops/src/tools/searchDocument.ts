import type { Editor, ToolDefinition } from "@pen/types";

export function searchDocumentTool(editor: Editor): ToolDefinition {
  return {
    name: "search_document",
    description: "Search for text in the document.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        caseSensitive: { type: "boolean" },
        maxResults: { type: "number", default: 20 },
      },
    },
    handler: async (input: unknown) => {
      const opts = input as {
        query: string;
        caseSensitive?: boolean;
        maxResults?: number;
      };
      const caseSensitive = opts.caseSensitive ?? false;
      const maxResults = opts.maxResults ?? 20;
      const results: Array<{
        blockId: string;
        offset: number;
        length: number;
        snippet: string;
      }> = [];

      const searchStr = caseSensitive
        ? opts.query
        : opts.query.toLowerCase();

      for (const handle of editor.blocks()) {
        const text = handle.textContent();
        const compareText = caseSensitive
          ? text
          : text.toLowerCase();
        let offset = 0;

        while (results.length < maxResults) {
          const idx = compareText.indexOf(searchStr, offset);
          if (idx === -1) break;
          results.push({
            blockId: handle.id,
            offset: idx,
            length: opts.query.length,
            snippet: text.slice(
              Math.max(0, idx - 30),
              Math.min(
                text.length,
                idx + opts.query.length + 30,
              ),
            ),
          });
          offset = idx + 1;
        }

        if (results.length >= maxResults) break;
      }

      return results;
    },
  };
}
