import {
	sortDeltaAttributes,
	type Editor,
	type Position,
	type DocumentOp,
	type AssetProvider,
	type TextSelection,
} from "@pen/core";
import type { FieldEditorImpl } from "./fieldEditorImpl.js";
import type { PasteImporters } from "../context/editorContext.js";

const IMAGE_MIME_RE = /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|avif)$/;
const IMAGE_BLOCK_TYPE = "image";

type Delta = { insert: string; attributes?: Record<string, unknown> };

// ── Paste entry points ──────────────────────────────────────

/**
 * Paste handler for `beforeinput` `insertFromPaste` events.
 */
export function handlePaste(
	event: InputEvent,
	editor: Editor,
	fieldEditor: FieldEditorImpl,
	importers?: PasteImporters,
): void {
	const dataTransfer = (event as any).dataTransfer as DataTransfer | null;
	if (!dataTransfer) return;
	applyPasteFromDataTransfer(dataTransfer, editor, fieldEditor, importers);
}

/**
 * Paste handler for native `ClipboardEvent` (used by EditContext backend
 * and any path that doesn't get `beforeinput` `insertFromPaste`).
 */
export function handleClipboardPaste(
	event: ClipboardEvent,
	editor: Editor,
	fieldEditor: FieldEditorImpl,
	importers?: PasteImporters,
): void {
	const dataTransfer = event.clipboardData;
	if (!dataTransfer) return;
	applyPasteFromDataTransfer(dataTransfer, editor, fieldEditor, importers);
}

// ── Paste pipeline ──────────────────────────────────────────

interface CursorContext {
	blockId: string;
	offset: number;
	blockType: string;
	isInline: boolean;
}

function getCursorContext(editor: Editor): CursorContext | null {
	const sel = editor.selection;
	if (sel?.type !== "text") return null;
	const blockId = sel.anchor.blockId;
	const block = editor.getBlock(blockId);
	if (!block) return null;
	const schema = editor.schema.resolve(block.type);
	return {
		blockId,
		offset: sel.anchor.offset,
		blockType: block.type,
		isInline: schema?.content === "inline",
	};
}

function applyPasteFromDataTransfer(
	dataTransfer: DataTransfer,
	editor: Editor,
	fieldEditor: FieldEditorImpl,
	importers?: PasteImporters,
): void {
	const cursorBefore = getCursorContext(editor);
	const selectionBefore = snapshotSelection(editor);

	const penPayload = dataTransfer.getData("application/x-pen-blocks");
	if (penPayload) {
		try {
			const blocks = JSON.parse(penPayload) as PenBlock[];
			if (Array.isArray(blocks) && blocks.length > 0) {
				const { cursorAfter } = deleteSelectionForPaste(editor, cursorBefore);
				pasteBlocks(blocks, editor, fieldEditor, cursorAfter);
				return;
			}
		} catch {
			/* fall through */
		}
	}

	const html = dataTransfer.getData("text/html");
	if (html) {
		const penMatch = html.match(/data-pen-blocks="([^"]*)"/);
		if (penMatch) {
			try {
				const blocks = decodePenBlocksFromHtml(penMatch[1]);
				if (Array.isArray(blocks) && blocks.length > 0) {
					const { cursorAfter } = deleteSelectionForPaste(editor, cursorBefore);
					pasteBlocks(blocks, editor, fieldEditor, cursorAfter);
					return;
				}
			} catch {
				/* fall through to HTML import */
			}
		}

		if (importers?.html) {
			const { position } = deleteSelectionForPaste(editor, cursorBefore);
			importers.html.import(html, editor, { undoGroup: true, position });
			placeCursorAfterImport(editor, fieldEditor);
			return;
		}
	}

	const imageFiles = getImageFiles(dataTransfer);
	if (imageFiles.length > 0) {
		const assetProvider = editor.internals.getSlot<AssetProvider>(
			"paste:assetProvider",
		);
		if (assetProvider && editor.schema.resolve(IMAGE_BLOCK_TYPE)) {
			void pasteImageFiles(
				imageFiles,
				editor,
				assetProvider,
				cursorBefore,
				selectionBefore,
			);
			return;
		}
	}

	const text = dataTransfer.getData("text/plain");
	if (text) {
		const { cursorAfter, position } = deleteSelectionForPaste(editor, cursorBefore);
		if (importers?.markdown) {
			importers.markdown.import(text, editor, {
				undoGroup: true,
				position,
			});
			placeCursorAfterImport(editor, fieldEditor);
			return;
		}
		pasteInlineText(editor, fieldEditor, text, cursorAfter);
	}
}

// ── Pen block paste (internal copy/paste round-trip) ────────

interface PenBlock {
	type?: string;
	props?: Record<string, unknown>;
	content?: string;
	deltas?: Delta[];
	isPartial?: boolean;
}

/**
 * Intelligently paste pen blocks. When a single inline-content block is
 * pasted into a cursor inside the same type of inline block, the text
 * merges inline instead of creating a new block.
 */
function pasteBlocks(
	blocks: PenBlock[],
	editor: Editor,
	fieldEditor: FieldEditorImpl,
	cursor: CursorContext | null,
): void {
	const valid = blocks.filter(
		(b) => b && typeof b === "object" && b.type && editor.schema.resolve(b.type),
	);
	if (valid.length === 0) return;

	const single = valid.length === 1 ? valid[0] : null;
	const singleSchema = single?.type
		? editor.schema.resolve(single.type)
		: null;
	const singleIsPartialInline =
		single &&
		singleSchema?.content === "inline" &&
		(Array.isArray(single.deltas) || typeof single.content === "string") &&
		single.isPartial;

	if (singleIsPartialInline && cursor?.isInline) {
		const deltas = getPenBlockInlineDeltas(single);
		if (deltas.length > 0) {
			pasteInlineFragment(editor, fieldEditor, deltas, cursor);
			return;
		}
		if (typeof single.content === "string") {
			pasteInlineText(editor, fieldEditor, single.content, cursor);
		}
		return;
	}

	const ops: DocumentOp[] = [];
	let prevBlockId: string | null = null;
	let lastBlockId: string | null = null;
	let lastContentLength = 0;
	let lastIsInline = false;

	for (const block of valid) {
		const schema = editor.schema.resolve(block.type!)!;
		const blockId = crypto.randomUUID();
		const blockPosition: Position = prevBlockId
			? { after: prevBlockId }
			: cursor
				? { after: cursor.blockId }
				: "last";

		ops.push({
			type: "insert-block",
			blockId,
			blockType: block.type!,
			props: block.props ?? {},
			position: blockPosition,
		});

		if (schema.content === "inline") {
			const deltas = getPenBlockInlineDeltas(block);
			if (deltas.length > 0) {
				lastContentLength = appendInlineContentOps(ops, blockId, deltas);
			} else {
				lastContentLength = 0;
			}
		} else {
			lastContentLength = 0;
		}

		lastBlockId = blockId;
		lastIsInline = schema.content === "inline";
		prevBlockId = blockId;
	}

	if (ops.length > 0) {
		editor.apply(ops, { origin: "user", undoGroup: true });
	}

	if (lastBlockId && lastIsInline) {
		fieldEditor.activateTextSelection(
			lastBlockId,
			lastContentLength,
			lastContentLength,
		);
	}
}

// ── Inline text insertion ───────────────────────────────────

function pasteInlineFragment(
	editor: Editor,
	fieldEditor: FieldEditorImpl,
	deltas: Delta[],
	cursor: CursorContext | null,
): void {
	if (!cursor?.isInline) return;

	const plainText = deltasToPlainText(deltas);
	if (!plainText) return;
	if (plainText.includes("\n") || !hasAttributedDeltas(deltas)) {
		pasteInlineText(editor, fieldEditor, plainText, cursor);
		return;
	}

	const ops: DocumentOp[] = [];
	let offset = cursor.offset;
	for (const delta of deltas) {
		if (!delta.insert) continue;
		ops.push({
			type: "insert-text",
			blockId: cursor.blockId,
			offset,
			text: delta.insert,
			...(delta.attributes ? { marks: delta.attributes } : {}),
		});
		offset += delta.insert.length;
	}

	if (ops.length === 0) return;
	editor.apply(ops, { origin: "user", undoGroup: true });
	fieldEditor.activateTextSelection(cursor.blockId, offset, offset);
}

function pasteInlineText(
	editor: Editor,
	fieldEditor: FieldEditorImpl,
	text: string,
	cursor: CursorContext | null,
): void {
	if (!cursor?.isInline) return;

	const { blockId, offset, blockType } = cursor;
	const lines = text.split(/\r?\n/);

	if (lines.length === 1) {
		const insertedText = lines[0];
		editor.apply(
			[{ type: "insert-text", blockId, offset, text: insertedText }],
			{ origin: "user", undoGroup: true },
		);
		fieldEditor.activateTextSelection(
			blockId,
			offset + insertedText.length,
			offset + insertedText.length,
		);
		return;
	}

	const ops: DocumentOp[] = [];
	const firstLine = lines[0];
	if (firstLine) {
		ops.push({ type: "insert-text", blockId, offset, text: firstLine });
	}

	const tailText = editor.getBlock(blockId)?.textContent().slice(offset) ?? "";

	if (tailText) {
		ops.push({
			type: "delete-text",
			blockId,
			offset: offset + (firstLine?.length ?? 0),
			length: tailText.length,
		});
	}

	let prevId = blockId;
	let lastInsertedId = blockId;
	let lastInsertedTextLength = offset + (firstLine?.length ?? 0);

	for (let i = 1; i < lines.length; i++) {
		const newId = crypto.randomUUID();
		const isLast = i === lines.length - 1;
		const lineText = isLast ? lines[i] + tailText : lines[i];

		ops.push({
			type: "insert-block",
			blockId: newId,
			blockType: blockType,
			props: {},
			position: { after: prevId },
		});
		if (lineText) {
			ops.push({
				type: "insert-text",
				blockId: newId,
				offset: 0,
				text: lineText,
			});
		}
		lastInsertedId = newId;
		lastInsertedTextLength = lines[i]?.length ?? 0;
		prevId = newId;
	}

	if (ops.length > 0) {
		editor.apply(ops, { origin: "user", undoGroup: true });
		fieldEditor.activateTextSelection(
			lastInsertedId,
			lastInsertedTextLength,
			lastInsertedTextLength,
		);
	}
}

// ── Image paste ─────────────────────────────────────────────

function getImageFiles(dataTransfer: DataTransfer): File[] {
	const files: File[] = [];
	for (let i = 0; i < dataTransfer.files.length; i++) {
		const file = dataTransfer.files[i];
		if (IMAGE_MIME_RE.test(file.type)) {
			files.push(file);
		}
	}
	return files;
}

async function pasteImageFiles(
	files: File[],
	editor: Editor,
	assetProvider: AssetProvider,
	cursorBefore: CursorContext | null,
	selectionBefore: SelectionSnapshot | null,
): Promise<void> {
	if (!editor.schema.resolve(IMAGE_BLOCK_TYPE)) return;

	const uploaded: Array<{ src: string; alt: string }> = [];

	for (const file of files) {
		try {
			const ref = await assetProvider.upload(file, {
				mimeType: file.type,
			});
			uploaded.push({
				src: assetProvider.resolve(ref),
				alt: file.name?.replace(/\.[^.]+$/, "") ?? "",
			});
		} catch {
			/* skip files that fail to upload */
		}
	}

	if (uploaded.length === 0) return;
	if (!selectionSnapshotMatches(editor, selectionBefore)) return;

	const { position } = deleteSelectionForPaste(editor, cursorBefore);
	const ops: DocumentOp[] = [];
	let previousBlockId: string | null = null;

	for (const image of uploaded) {
		const blockId = crypto.randomUUID();
		ops.push({
			type: "insert-block",
			blockId,
			blockType: IMAGE_BLOCK_TYPE,
			props: {
				src: image.src,
				alt: image.alt,
			},
			position: previousBlockId
				? { after: previousBlockId }
				: (position ?? "last"),
		});
		previousBlockId = blockId;
	}

	editor.apply(ops, { origin: "user", undoGroup: true });
}

// ── Copy ────────────────────────────────────────────────────

/**
 * Copy handler. Serializes selected content to the clipboard via
 * the synchronous ClipboardEvent.clipboardData API.
 *
 * For single-block partial text selections, copies only the selected
 * text (not the whole block) and marks it as `isPartial` so paste
 * knows to insert inline rather than create a new block.
 */
export function handleCopy(editor: Editor, event?: ClipboardEvent): void {
	const selection = editor.selection;
	if (!selection) return;
	if (selection.type === "text" && selection.isCollapsed) return;

	if (selection.type === "text" && !selection.isMultiBlock) {
		copyInlineSelection(editor, selection, event);
		return;
	}

	copyBlockSelection(editor, event);
}

function copyInlineSelection(
	editor: Editor,
	selection: TextSelection,
	event?: ClipboardEvent,
): void {
	const blockId = selection.anchor.blockId;
	const from = Math.min(selection.anchor.offset, selection.focus.offset);
	const to = Math.max(selection.anchor.offset, selection.focus.offset);
	const block = editor.getBlock(blockId);
	if (!block) return;

	const selectedText = block.textContent().slice(from, to);
	if (!selectedText) return;

	const schema = editor.schema.resolve(block.type);
	const isFullBlock = from === 0 && to >= block.textContent().length;
	const selectedDeltas = sliceDeltas(block.textDeltas(), from, to);

	const penBlock: PenBlock = {
		type: block.type,
		props: isFullBlock ? block.props : {},
		content: selectedText,
		deltas: selectedDeltas,
		isPartial: !isFullBlock,
	};

	let htmlContent = "";
	if (schema?.serialize?.toHTML) {
		const inlineHtml = serializeDeltasToFormat(
			selectedDeltas,
			editor,
			"html",
		);
		htmlContent = schema.serialize.toHTML({
			id: block.id,
			type: block.type,
			props: isFullBlock ? block.props : {},
			content: inlineHtml || selectedText,
		});
	}

	let mdContent = "";
	if (schema?.serialize?.toMarkdown) {
		const inlineMd = serializeDeltasToFormat(
			selectedDeltas,
			editor,
			"markdown",
		);
		mdContent = schema.serialize.toMarkdown({
			id: block.id,
			type: block.type,
			props: isFullBlock ? block.props : {},
			content: inlineMd || selectedText,
		});
	}

	const plainText = mdContent || selectedText;
	writePenClipboard([penBlock], htmlContent, plainText, event);
}

function copyBlockSelection(editor: Editor, event?: ClipboardEvent): void {
	const selection = editor.selection;
	if (!selection) return;

	const blocks = editor.getSelectedBlocks();
	if (blocks.length === 0) return;

	const isText = selection.type === "text";
	const range = isText ? (selection as TextSelection).toRange() : null;

	const htmlParts: string[] = [];
	const mdParts: string[] = [];
	const penBlocks: PenBlock[] = [];

	for (let i = 0; i < blocks.length; i++) {
		const block = blocks[i];
		const schema = editor.schema.resolve(block.type);
		const fullText = block.textContent();
		const isFirst = i === 0;
		const isLast = i === blocks.length - 1;

		let sliceFrom = 0;
		let sliceTo = fullText.length;
		if (isText && range) {
			if (isFirst) sliceFrom = range.start.offset;
			if (isLast) sliceTo = range.end.offset;
		}
		const isPartial = sliceFrom > 0 || sliceTo < fullText.length;
		const content = isPartial ? fullText.slice(sliceFrom, sliceTo) : fullText;
		const deltas = block.textDeltas();
		const slicedDeltas = isPartial
			? sliceDeltas(deltas, sliceFrom, sliceTo)
			: deltas;

		penBlocks.push({
			type: block.type,
			props: block.props,
			content,
			deltas: slicedDeltas,
			isPartial,
		});

		if (schema?.serialize?.toHTML) {
			const inlineHtml = serializeDeltasToFormat(slicedDeltas, editor, "html");
			htmlParts.push(
				schema.serialize.toHTML({
					id: block.id,
					type: block.type,
					props: block.props,
					content: inlineHtml || content,
				}),
			);
		}
		if (schema?.serialize?.toMarkdown) {
			const inlineMd = serializeDeltasToFormat(
				slicedDeltas,
				editor,
				"markdown",
			);
			mdParts.push(
				schema.serialize.toMarkdown({
					id: block.id,
					type: block.type,
					props: block.props,
					content: inlineMd || content,
				}),
			);
		}
	}

	const htmlContent = htmlParts.join("\n");
	const plainText =
		mdParts.join("\n") || blocks.map((b) => b.textContent()).join("\n");

	writePenClipboard(penBlocks, htmlContent, plainText, event);
}

function writePenClipboard(
	penBlocks: PenBlock[],
	htmlContent: string,
	plainText: string,
	event?: ClipboardEvent,
): void {
	const penBlocksJson = JSON.stringify(penBlocks);
	const encodedPenBlocks = encodePenBlocksForHtml(penBlocksJson);
	const htmlWithPenData = `<meta data-pen-blocks="${encodedPenBlocks}" />${htmlContent}`;

	if (event?.clipboardData) {
		event.clipboardData.setData("text/plain", plainText);
		event.clipboardData.setData("text/html", htmlWithPenData);
		event.clipboardData.setData(
			"application/x-pen-blocks",
			penBlocksJson,
		);
		return;
	}

	navigator.clipboard
		.write([
			new ClipboardItem({
				"application/x-pen-blocks": new Blob([penBlocksJson], {
					type: "application/x-pen-blocks",
				}),
				"text/html": new Blob([htmlWithPenData], {
					type: "text/html",
				}),
				"text/plain": new Blob([plainText], {
					type: "text/plain",
				}),
			}),
		])
		.catch(() => {
			navigator.clipboard.writeText(plainText).catch(() => {});
		});
}

// ── Delta slicing & serialization ───────────────────────────

function sliceDeltas(deltas: Delta[], from: number, to: number): Delta[] {
	const result: Delta[] = [];
	let offset = 0;

	for (const delta of deltas) {
		const text = delta.insert;
		const len = text.length;
		const segStart = offset;
		const segEnd = offset + len;

		if (segEnd <= from || segStart >= to) {
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

function getPenBlockInlineDeltas(block: PenBlock): Delta[] {
	if (Array.isArray(block.deltas)) {
		const deltas = block.deltas.filter(
			(delta) =>
				delta &&
				typeof delta === "object" &&
				typeof delta.insert === "string" &&
				delta.insert.length > 0,
		);
		if (deltas.length > 0) return deltas;
	}

	if (typeof block.content === "string" && block.content.length > 0) {
		return [{ insert: block.content }];
	}

	return [];
}

function appendInlineContentOps(
	ops: DocumentOp[],
	blockId: string,
	deltas: Delta[],
): number {
	let offset = 0;

	for (const delta of deltas) {
		if (!delta.insert) continue;
		ops.push({
			type: "insert-text",
			blockId,
			offset,
			text: delta.insert,
			...(delta.attributes ? { marks: delta.attributes } : {}),
		});
		offset += delta.insert.length;
	}

	return offset;
}

function deltasToPlainText(deltas: Delta[]): string {
	return deltas.map((delta) => delta.insert).join("");
}

function hasAttributedDeltas(deltas: Delta[]): boolean {
	return deltas.some(
		(delta) => delta.attributes && Object.keys(delta.attributes).length > 0,
	);
}

function encodePenBlocksForHtml(penBlocksJson: string): string {
	return bytesToBase64(new TextEncoder().encode(penBlocksJson));
}

function decodePenBlocksFromHtml(encoded: string): PenBlock[] {
	return JSON.parse(new TextDecoder().decode(base64ToBytes(encoded))) as PenBlock[];
}

function bytesToBase64(bytes: Uint8Array): string {
	const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	return Uint8Array.from(binary, (value) => value.codePointAt(0) ?? 0);
}

type SelectionSnapshot =
	| {
			type: "text";
			anchor: { blockId: string; offset: number };
			focus: { blockId: string; offset: number };
	  }
	| {
			type: "block";
			blockIds: string[];
	  }
	| {
			type: "app";
			appId: string;
	  }
	| {
			type: "cell";
			blockId: string;
			anchor: { row: number; col: number };
			head: { row: number; col: number };
	  }
	| null;

function snapshotSelection(editor: Editor): SelectionSnapshot {
	const selection = editor.selection;
	if (!selection) return null;

	switch (selection.type) {
		case "text":
			return {
				type: "text",
				anchor: { ...selection.anchor },
				focus: { ...selection.focus },
			};
		case "block":
			return {
				type: "block",
				blockIds: [...selection.blockIds],
			};
		case "app":
			return {
				type: "app",
				appId: selection.appId,
			};
		case "cell":
			return {
				type: "cell",
				blockId: selection.blockId,
				anchor: { ...selection.anchor },
				head: { ...selection.head },
			};
		default:
			return null;
	}
}

function selectionSnapshotMatches(
	editor: Editor,
	snapshot: SelectionSnapshot,
): boolean {
	return JSON.stringify(snapshotSelection(editor)) === JSON.stringify(snapshot);
}

function deleteSelectionForPaste(
	editor: Editor,
	cursorBefore: CursorContext | null,
): {
	cursorAfter: CursorContext | null;
	position: Position | undefined;
} {
	editor.deleteSelection();
	const cursorAfter = getCursorContext(editor) ?? cursorBefore;

	return {
		cursorAfter,
		position: cursorAfter ? { after: cursorAfter.blockId } : undefined,
	};
}

function serializeDeltasToFormat(
	deltas: Delta[],
	editor: Editor,
	format: "html" | "markdown",
): string {
	if (deltas.length === 0) return "";

	let result = "";
	for (const delta of deltas) {
		let text = delta.insert;
		if (text === "\u200B") continue;

		if (delta.attributes) {
			const ordered = sortDeltaAttributes(delta.attributes, editor.schema);
			for (const [mark, props] of Object.entries(ordered)) {
				const inlineSchema = editor.schema.resolveInline(mark);
				if (format === "html") {
					if (!inlineSchema?.serialize?.toHTML) continue;
					text = inlineSchema.serialize.toHTML(
						text,
						typeof props === "object"
							? (props as Record<string, unknown>)
							: {},
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

// ── Cut ─────────────────────────────────────────────────────

export function handleCut(editor: Editor, event?: ClipboardEvent): void {
	handleCopy(editor, event);
	editor.deleteSelection();
}

// ── Post-importer cursor ────────────────────────────────────

function placeCursorAfterImport(
	editor: Editor,
	fieldEditor: FieldEditorImpl,
): void {
	const sel = editor.selection;
	if (sel?.type === "text") {
		fieldEditor.activateTextSelection(
			sel.anchor.blockId,
			sel.anchor.offset,
			sel.anchor.offset,
		);
	}
}
