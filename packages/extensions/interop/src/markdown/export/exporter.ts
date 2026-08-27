import type { BlockHandle, Editor, Exporter, ExportOptions } from "@input/pen-types";
import {
  exportMarkdownForBlocks as serializeMarkdownForBlocks,
  exportMarkdownRange as serializeMarkdownRange,
} from "@input/pen-markdown";
import type {
  MarkdownExportConfig,
  MarkdownExportRange,
  MarkdownExportViewMode,
} from "@input/pen-markdown";
import { admitMarkdownUrls } from "./admitMarkdownUrls";

type MarkdownExporterExtraOptions = Record<string, unknown> & {
  range?: MarkdownExportRange;
  viewMode?: MarkdownExportViewMode;
};

export function exportMarkdownForBlocks(
  editor: Editor,
  handles: Iterable<BlockHandle>,
  config?: MarkdownExportConfig,
): string {
  return admitMarkdownUrls(serializeMarkdownForBlocks(editor, handles, config));
}

export function exportMarkdownRange(
  editor: Editor,
  range?: MarkdownExportRange | null,
  config?: MarkdownExportConfig,
): string {
  return admitMarkdownUrls(serializeMarkdownRange(editor, range, config));
}

export const markdownExporter: Exporter<string, MarkdownExporterExtraOptions> = {
  name: "markdown",
  mimeType: "text/markdown",
  fileExtension: ".md",

  export(editor: Editor, options?: ExportOptions<MarkdownExporterExtraOptions>): string {
    const viewMode =
      options?.extra?.viewMode ??
      (options?.includeSuggestions === false ? "resolved" : "raw");
    const config: MarkdownExportConfig = {
      viewMode,
    };
    const range = options?.extra?.range;
    if (range) {
      return exportMarkdownRange(editor, range, config);
    }
    return exportMarkdownForBlocks(
      editor,
      editor.documentState.allBlocks(),
      config,
    );
  },
};
export type {
  MarkdownExportConfig,
  MarkdownExportRange,
  MarkdownExportViewMode,
};
