import { memoryAssets } from "@input/pen-assets-memory";
import { htmlImporter } from "@input/pen-interop/html";
import { markdownImporter } from "@input/pen-interop/markdown";
import type { PasteImporters } from "@input/pen-react";

export const PLAYGROUND_BLOCK_TYPE_ORDER = [
	"paragraph",
	"heading",
	"bulletListItem",
	"numberedListItem",
	"checkListItem",
	"codeBlock",
	"blockquote",
	"callout",
	"table",
	"toggle",
] as const;

const playgroundAssets = memoryAssets();

export const PLAYGROUND_ASSETS = playgroundAssets;

export const PLAYGROUND_IMPORTERS: PasteImporters = {
	html: htmlImporter,
	markdown: markdownImporter,
};
