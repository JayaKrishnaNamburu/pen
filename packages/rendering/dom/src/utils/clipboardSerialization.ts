import {
	buildTableChildren,
	sortDeltaAttributes,
} from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { resolveEditorUrl } from "../security/resolveEditorUrl";
import {
	PEN_CLIPBOARD_JSON_MIME,
	PEN_CLIPBOARD_JSON_MIME_LEGACY,
	encodePenBlocksForHtml,
	serializePenClipboardPayload,
	type Delta,
	type PenBlock,
} from "./clipboardPayload";

// sentinel-storage: apply executors still persist the empty-block sentinel in
// Y.Text. Clipboard serialization emits the logical text domain and strips that
// storage sentinel at the export boundary — it does not treat the sentinel as
// empty-block meaning.
function logicalExportText(text: string): string {
	return text.replaceAll("\u200B", "");
}

function emitClipboardWriteFailed(
	editor: Editor | undefined,
	error: unknown,
): void {
	if (!editor) {
		return;
	}
	editor.internals.emit("diagnostic", {
		code: "PEN_CLIPBOARD_002",
		level: "warn",
		source: "clipboard",
		message: "Clipboard write failed",
		remediation:
			"Grant clipboard permission or copy while the editor is focused.",
		error,
	});
}

export function writePenClipboard(
	penBlocks: PenBlock[],
	htmlContent: string,
	plainText: string,
	event?: ClipboardEvent,
	editor?: Editor,
): void {
	const penBlocksJson = serializePenClipboardPayload(penBlocks);
	const encodedPenBlocks = encodePenBlocksForHtml(penBlocksJson);
	const htmlWithPenData = `<meta data-pen-blocks="${encodedPenBlocks}" />${htmlContent}`;
	const clipboardPlainText = logicalExportText(plainText);

	if (event?.clipboardData) {
		event.clipboardData.setData("text/plain", clipboardPlainText);
		event.clipboardData.setData("text/html", htmlWithPenData);
		event.clipboardData.setData(PEN_CLIPBOARD_JSON_MIME, penBlocksJson);
		event.clipboardData.setData(
			PEN_CLIPBOARD_JSON_MIME_LEGACY,
			penBlocksJson,
		);
		return;
	}

	navigator.clipboard
		.write([
			new ClipboardItem({
				[PEN_CLIPBOARD_JSON_MIME]: new Blob([penBlocksJson], {
					type: PEN_CLIPBOARD_JSON_MIME,
				}),
				[PEN_CLIPBOARD_JSON_MIME_LEGACY]: new Blob([penBlocksJson], {
					type: PEN_CLIPBOARD_JSON_MIME_LEGACY,
				}),
				"text/html": new Blob([htmlWithPenData], {
					type: "text/html",
				}),
				"text/plain": new Blob([clipboardPlainText], {
					type: "text/plain",
				}),
			}),
		])
		.catch((error: unknown) => {
			navigator.clipboard
				.writeText(clipboardPlainText)
				.catch((fallbackError: unknown) => {
					// CH5: terminal clipboard write — no remaining copy fallback.
					emitClipboardWriteFailed(editor, fallbackError ?? error);
				});
		});
}

export function sliceDeltas(deltas: Delta[], from: number, to: number): Delta[] {
	const result: Delta[] = [];
	let offset = 0;

	for (const delta of deltas) {
		const text = typeof delta.insert === "string" ? delta.insert : null;
		const len = text?.length ?? 1;
		const segStart = offset;
		const segEnd = offset + len;

		if (text == null || segEnd <= from || segStart >= to) {
			offset += len;
			continue;
		}

		const sliceStart = Math.max(from - segStart, 0);
		const sliceEnd = Math.min(to - segStart, len);
		const sliced = text.slice(sliceStart, sliceEnd);

		if (sliced) {
			result.push({
				insert: sliced,
				...(delta.attributes ? { attributes: delta.attributes } : {}),
			});
		}
		offset += len;
	}

	return result;
}

export function serializeDeltasToFormat(
	deltas: Delta[],
	editor: Editor,
	format: "html" | "markdown",
): string {
	if (deltas.length === 0) return "";

	let result = "";
	for (const delta of deltas) {
		if (typeof delta.insert !== "string") continue;
		let text = logicalExportText(delta.insert);
		if (!text) continue;

		if (delta.attributes) {
			const ordered = sortDeltaAttributes(delta.attributes, editor.schema);
			for (const [mark, props] of Object.entries(ordered)) {
				const inlineSchema = editor.schema.resolveInline(mark);
				if (format === "html") {
					if (!inlineSchema?.serialize?.toHTML) continue;
					const rawProps =
						typeof props === "object"
							? (props as Record<string, unknown>)
							: {};
					text = inlineSchema.serialize.toHTML(
						text,
						mark === "link"
							? admitClipboardLinkProps(editor, rawProps)
							: rawProps,
					);
				} else {
					if (!inlineSchema?.serialize?.toMarkdown) continue;
					text = inlineSchema.serialize.toMarkdown(
						text,
						typeof props === "object"
							? (props as Record<string, unknown>)
							: {},
					);
				}
			}
		}

		result += text;
	}

	return result;
}

function admitClipboardLinkProps(
	editor: Editor,
	props: Record<string, unknown>,
): Record<string, unknown> {
	const href = resolveEditorUrl(editor, props.href, "link");
	if (href === null) {
		const admitted = { ...props };
		delete admitted.href;
		return admitted;
	}
	return { ...props, href };
}

export { buildTableChildren };

