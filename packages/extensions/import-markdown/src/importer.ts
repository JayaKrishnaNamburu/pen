import type { Importer, ImportOptions, Editor } from "@input/pen-types";
import {
	blocksToOps,
	normalizePendingBlocksForImport,
	type PendingBlock,
	parseMarkdownToBlocks as parseMarkdownContentToBlocks,
} from "@input/pen-content-ops";
import {
	boundPendingBlocks,
	capRawMarkdownSource,
	createIngestReport,
	emitIngestReport,
	IngestDropCounts,
	type IngestReport,
} from "./ingestBounds";

export function parseMarkdownWithReport(
	input: string,
	editor: Editor,
): {
	blocks: PendingBlock[];
	report: IngestReport;
} {
	const drops = new IngestDropCounts();
	const source = capRawMarkdownSource(input, drops);
	const parsedBlocks = parseMarkdownContentToBlocks(source, editor);
	const bounded = boundPendingBlocks(parsedBlocks, drops);
	return {
		blocks: bounded,
		report: createIngestReport(
			parsedBlocks.length,
			bounded.length,
			[],
			drops,
		),
	};
}

function normalizeMarkdownToBlocks(
	input: string,
	editor: Editor,
): {
	blocks: PendingBlock[];
	result: IngestReport;
} {
	const drops = new IngestDropCounts();
	const source = capRawMarkdownSource(input, drops);
	const parsedBlocks = parseMarkdownContentToBlocks(source, editor);
	const bounded = boundPendingBlocks(parsedBlocks, drops);
	const normalized = normalizePendingBlocksForImport(
		bounded,
		editor.documentProfile,
		editor.schema,
	);

	for (const violation of normalized.violations) {
		switch (violation.reason) {
			case "unknown-block-type":
				drops.add("unknown-block-type");
				break;
			case "flow-disallowed-block":
				drops.add("profile-disallowed");
				break;
			default: {
				const exhaustive: never = violation.reason;
				throw new Error(exhaustive);
			}
		}
	}

	const droppedBlockTypes = [
		...new Set(normalized.violations.map((violation) => violation.blockType)),
	];
	const result = createIngestReport(
		parsedBlocks.length,
		normalized.blocks.length,
		droppedBlockTypes,
		drops,
	);
	emitIngestReport(editor, result, "import-markdown");

	return {
		blocks: normalized.blocks,
		result,
	};
}

export function parseMarkdownToBlocks(
	input: string,
	editor: Editor,
): PendingBlock[] {
	return parseMarkdownWithReport(input, editor).blocks;
}

export const markdownImporter = {
	name: "markdown",
	mimeType: "text/markdown",
	parse(input: string, editor: Editor): PendingBlock[] {
		const { blocks, report } = parseMarkdownWithReport(input, editor);
		emitIngestReport(editor, report, "import-markdown");
		return blocks;
	},

	import(input: string, editor: Editor, options?: ImportOptions): IngestReport {
		const { blocks, result } = normalizeMarkdownToBlocks(input, editor);
		if (blocks.length === 0) return result;

		const ops = blocksToOps(blocks, options);

		editor.apply(ops, {
			origin: "import",
			...(options?.undoGroup === false ? {} : { undoGroup: true }),
		});
		return result;
	},
} satisfies Importer<string, PendingBlock[]>;
