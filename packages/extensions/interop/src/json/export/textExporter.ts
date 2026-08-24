import type { Editor, Exporter, ExportOptions } from "@input/pen-types";
import { exportEditorToJson } from "./exporter";
import type {
	PenBlockJSON,
	PenDocumentJSON,
	PenInlineNodeSegmentJSON,
	PenInlineSegmentJSON,
} from "./types";

const DEFAULT_SEPARATOR = "\n";

export type PenTextExportExtraOptions = Record<string, unknown> & {
	excludeBlockTypes?: string[];
	includeBlockTypes?: string[];
	separator?: string;
	renderInlineNode?: (segment: PenInlineNodeSegmentJSON) => string;
};

export const textExporter: Exporter<string, PenTextExportExtraOptions> = {
	name: "text",
	mimeType: "text/plain",
	fileExtension: ".txt",

	export(
		editor: Editor,
		options?: ExportOptions<PenTextExportExtraOptions>,
	): string {
		return exportEditorToText(editor, options);
	},
};

export function exportEditorToText(
	editor: Editor,
	options?: ExportOptions<PenTextExportExtraOptions>,
): string {
	return exportPenDocumentToText(exportEditorToJson(editor), options?.extra);
}

export function exportPlainText(
	editor: Editor,
	options?: ExportOptions<PenTextExportExtraOptions>,
): string {
	return exportEditorToText(editor, options);
}

export function exportPenDocumentToText(
	document: PenDocumentJSON,
	options: PenTextExportExtraOptions = {},
): string {
	const separator = options.separator ?? DEFAULT_SEPARATOR;
	return document.blocks
		.flatMap((block) => renderBlockText(block, options))
		.join(separator);
}

function renderBlockText(
	block: PenBlockJSON,
	options: PenTextExportExtraOptions,
): string[] {
	if (options.excludeBlockTypes?.includes(block.type)) {
		return [];
	}
	if (
		options.includeBlockTypes &&
		!options.includeBlockTypes.includes(block.type)
	) {
		return [];
	}

	const ownText = renderInlineContentText(block, options);
	const childTexts =
		block.children?.flatMap((child) => renderBlockText(child, options)) ??
		[];

	return [ownText, ...childTexts].filter((text) => text.length > 0);
}

function renderInlineContentText(
	block: PenBlockJSON,
	options: PenTextExportExtraOptions,
): string {
	if (block.content?.segments?.length) {
		return block.content.segments
			.map((segment) => renderInlineSegmentText(segment, options))
			.join("");
	}

	return block.content?.text ?? "";
}

function renderInlineSegmentText(
	segment: PenInlineSegmentJSON,
	options: PenTextExportExtraOptions,
): string {
	switch (segment.type) {
		case "text":
			return segment.text;
		case "node":
			return options.renderInlineNode?.(segment) ?? "";
		default: {
			const _never: never = segment;
			return _never;
		}
	}
}
