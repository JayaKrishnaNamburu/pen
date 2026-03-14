import type {
	ImportResult,
	Importer,
	ImportOptions,
	Editor,
} from "@pen/types";
import {
	blocksToOps,
	createImportResult,
	normalizePendingBlocksForImport,
	type PendingBlock,
	reportPendingBlockImportViolations,
	parseMarkdownToBlocks as parseMarkdownContentToBlocks,
} from "@pen/content-ops";

function normalizeMarkdownToBlocks(
	input: string,
	editor: Editor,
): {
	blocks: PendingBlock[];
	result: ImportResult;
} {
	const parsedBlocks = parseMarkdownContentToBlocks(input, editor);
	const normalized = normalizePendingBlocksForImport(
		parsedBlocks,
		editor.documentProfile,
		editor.schema,
	);
	reportPendingBlockImportViolations(
		editor,
		normalized.violations,
		"import-markdown:parse",
	);
	return {
		blocks: normalized.blocks,
		result: createImportResult(
			parsedBlocks.length,
			normalized.blocks.length,
			normalized.violations,
		),
	};
}

export function parseMarkdownToBlocks(
	input: string,
	editor: Editor,
): PendingBlock[] {
	return parseMarkdownContentToBlocks(input, editor);
}

export const markdownImporter: Importer<string, PendingBlock[]> = {
	name: "markdown",
	mimeType: "text/markdown",
	parse(input: string, editor: Editor): PendingBlock[] {
		return parseMarkdownToBlocks(input, editor);
	},

	import(input: string, editor: Editor, options?: ImportOptions): ImportResult {
		const { blocks, result } = normalizeMarkdownToBlocks(input, editor);
		if (blocks.length === 0) return result;

		const ops = blocksToOps(blocks, options);

		editor.apply(ops, {
			origin: "import",
			...(options?.undoGroup === false ? {} : { undoGroup: true }),
		});
		return result;
	},
};
