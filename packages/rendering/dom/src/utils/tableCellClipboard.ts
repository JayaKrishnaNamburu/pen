import type { CellSelection, DocumentOp, Editor } from "@pen/types";
import {
	resolveCellSelectionCoord,
	resolveCellSelectionMatrix,
} from "@pen/core";

export function isPasteShortcut(event: KeyboardEvent): boolean {
	return (
		event.key.toLowerCase() === "v" &&
		!event.shiftKey &&
		!event.altKey &&
		(event.metaKey || event.ctrlKey)
	);
}

export async function cutCellSelection(
	editor: Editor,
	selection: CellSelection,
): Promise<void> {
	const copied = await copyCellSelection(editor, selection);
	if (copied) {
		editor.deleteSelection();
	}
}

export async function copyCellSelection(
	editor: Editor,
	selection: CellSelection,
): Promise<boolean> {
	const block = editor.getBlock(selection.blockId);
	if (!block) return false;

	const cellData: string[][] = [];
	for (const rowCells of resolveCellSelectionMatrix(block, selection)) {
		const row: string[] = [];
		for (const cellCoord of rowCells) {
			const cell = block.tableCell(cellCoord.row, cellCoord.col);
			row.push(cell?.textContent() ?? "");
		}
		cellData.push(row);
	}

	const tabSeparated = cellData.map((row) => row.join("\t")).join("\n");
	const penCells = JSON.stringify({
		cells: cellData,
		rows: cellData.length,
		cols: Math.max(...cellData.map((row) => row.length), 0),
	});
	const encodedPenCells = encodeURIComponent(penCells);

	const htmlRows = cellData.map((row) =>
		`<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
	).join("");
	const html = `<table>${htmlRows}</table>`;
	const clipboard = globalThis.navigator?.clipboard;
	if (!clipboard) {
		return false;
	}

	if (
		typeof ClipboardItem !== "undefined" &&
		typeof clipboard.write === "function"
	) {
		try {
			await clipboard.write([
				new ClipboardItem({
					"text/plain": new Blob([tabSeparated], { type: "text/plain" }),
					"text/html": new Blob(
						[`<meta data-pen-cells="${encodedPenCells}" />${html}`],
						{ type: "text/html" },
					),
				}),
			]);
			return true;
		} catch {
			// Fall through to plain-text clipboard writes below.
		}
	}

	if (typeof clipboard.writeText === "function") {
		try {
			await clipboard.writeText(tabSeparated);
			return true;
		} catch {
			return false;
		}
	}

	return false;
}

export function pasteCellSelection(editor: Editor, selection: CellSelection): void {
	navigator.clipboard.read().then((items) => {
		for (const item of items) {
			if (item.types.includes("text/html")) {
				item.getType("text/html").then((blob) => {
					blob.text().then((html) => {
						const penCellsMatch = html.match(/data-pen-cells=(['"])(.*?)\1/);
						if (penCellsMatch) {
							try {
								const parsed = parseEncodedCellPayload(penCellsMatch[2]);
								applyPastedCells(editor, selection, parsed.cells);
								return;
							} catch {
								// Fall through to plain-text clipboard reads below.
							}
						}
						pasteFromPlainText(editor, selection);
					});
				});
				return;
			}
		}
		pasteFromPlainText(editor, selection);
	}).catch(() => {
		pasteFromPlainText(editor, selection);
	});
}

function pasteFromPlainText(editor: Editor, selection: CellSelection): void {
	navigator.clipboard.readText().then((text) => {
		const cells = text.split("\n").map((row) => row.split("\t"));
		applyPastedCells(editor, selection, cells);
	}).catch(() => { });
}

function applyPastedCells(editor: Editor, selection: CellSelection, cellData: string[][]): void {
	const block = editor.getBlock(selection.blockId);
	if (!block) return;

	const rowCount = selection.rowIds?.length ?? block.tableRowCount();
	const colCount = selection.columnIds?.length ?? block.tableColumnCount();
	const startRow = Math.min(selection.anchor.row, selection.head.row);
	const startCol = Math.min(selection.anchor.col, selection.head.col);

	const ops: DocumentOp[] = [];
	for (let r = 0; r < cellData.length; r++) {
		const targetRow = startRow + r;
		if (targetRow >= rowCount) break;
		for (let c = 0; c < cellData[r].length; c++) {
			const targetCol = startCol + c;
			if (targetCol >= colCount) break;
			const resolvedCoord = resolveCellSelectionCoord(block, selection, {
				row: targetRow,
				col: targetCol,
			});
			if (!resolvedCoord) continue;
			const cell = block.tableCell(resolvedCoord.row, resolvedCoord.col);
			if (!cell) continue;
			const existingLen = cell.textContent().length;
			if (existingLen > 0) {
				ops.push({
					type: "delete-table-cell-text",
					blockId: selection.blockId,
					row: resolvedCoord.row,
					col: resolvedCoord.col,
					offset: 0,
					length: existingLen,
				});
			}
			const pasteText = cellData[r][c];
			if (pasteText.length > 0) {
				ops.push({
					type: "insert-table-cell-text",
					blockId: selection.blockId,
					row: resolvedCoord.row,
					col: resolvedCoord.col,
					offset: 0,
					text: pasteText,
				});
			}
		}
	}

	if (ops.length > 0) {
		editor.apply(ops, { origin: "user" });
	}
}

function parseEncodedCellPayload(raw: string): { cells: string[][] } {
	try {
		return JSON.parse(decodeURIComponent(raw)) as { cells: string[][] };
	} catch {
		return JSON.parse(raw) as { cells: string[][] };
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
