import { memoryAssets } from "@pen/assets-memory";
import { htmlImporter } from "@pen/import-html";
import { markdownImporter } from "@pen/import-markdown";
import type { PasteImporters } from "@pen/react";

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
	"database",
	"toggle",
] as const;

const playgroundAssets = memoryAssets();

export const PLAYGROUND_ASSETS = playgroundAssets;

export const PLAYGROUND_IMPORTERS: PasteImporters = {
	html: htmlImporter,
	markdown: markdownImporter,
};
