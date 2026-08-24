import type {
	DocumentOp,
	Editor,
	Importer,
	ImportOptions,
} from "@input/pen-types";
import { blocksToOps, type PendingBlock } from "@input/pen-content-ops";
import { emitIngestReport, type IngestReport } from "./ingestBounds";
import { ingestJsonDocument } from "./validateJson";

export function parseJsonWithReport(
	input: string | unknown,
	editor: Editor,
): {
	blocks: PendingBlock[];
	report: IngestReport;
} {
	return ingestJsonDocument(input, editor);
}

export function parseJsonToBlocks(
	input: string | unknown,
	editor: Editor,
): PendingBlock[] {
	return ingestJsonDocument(input, editor).blocks;
}

export const jsonImporter = {
	name: "json",
	mimeType: "application/json",

	parse(input: string | unknown, editor: Editor): PendingBlock[] {
		return parseJsonToBlocks(input, editor);
	},

	import(
		input: string | unknown,
		editor: Editor,
		options?: ImportOptions,
	): IngestReport {
		const { blocks, report } = ingestJsonDocument(input, editor);
		emitIngestReport(editor, report, "import-json");

		if (blocks.length === 0) {
			return report;
		}

		const importOps = blocksToOps(blocks, options);
		const ops = options?.replace
			? [...buildDeleteExistingBlockOps(editor), ...importOps]
			: importOps;

		editor.apply(ops, {
			origin: "import",
			...(options?.undoGroup === false ? {} : { undoGroup: true }),
		});

		return report;
	},
} satisfies Importer<string | unknown, PendingBlock[]>;

function buildDeleteExistingBlockOps(editor: Editor): DocumentOp[] {
	return [...editor.documentState.allBlocks()]
		.filter((handle) => handle.parent === null)
		.reverse()
		.map((handle) => ({
			type: "delete-block" as const,
			blockId: handle.id,
		}));
}
