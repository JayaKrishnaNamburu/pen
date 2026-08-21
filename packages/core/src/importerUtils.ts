import type { DocumentOp, ImportOptions, Position } from "@input/pen-types";
import { generateId } from "@input/pen-types";

export type { ImportOptions } from "@input/pen-types";

export type PendingInlineSegment =
	| {
			type: "text";
			text: string;
			attributes?: Record<string, unknown>;
	  }
	| {
			type: "node";
			nodeType: string;
			props?: Record<string, unknown>;
	  };

export interface PendingBlock {
	type: string;
	props: Record<string, unknown>;
	content?: string;
	marks?: Array<{
		type: string;
		props?: Record<string, unknown>;
		start: number;
		end: number;
	}>;
	segments?: PendingInlineSegment[];
	children?: PendingBlock[];
}

export function blocksToOps(
	blocks: PendingBlock[],
	options?: ImportOptions,
): DocumentOp[] {
	const ops: DocumentOp[] = [];
	let position: Position = options?.position ?? "last";

	for (const block of blocks) {
		if (block.type.startsWith("__table")) continue;

		const blockId = generateId();

		ops.push({
			type: "insert-block",
			blockId,
			blockType: block.type,
			props: cleanProps(block.props),
			position,
		});

		if (block.type === "table" && block.children) {
			materializeTableChildren(ops, blockId, block.children);
		} else {
			materializeInlineContent(ops, blockId, block);

			if (block.children) {
				for (let i = 0; i < block.children.length; i += 1) {
					const child = block.children[i];
					const childOps = blocksToOps([child], {
						position: { parent: blockId, index: i },
					});
					ops.push(...childOps);
				}
			}
		}

		position = { after: blockId };
	}

	return ops;
}

function materializeTableChildren(
	ops: DocumentOp[],
	blockId: string,
	rows: PendingBlock[],
): void {
	const tableRows = rows.filter((row) => row.type === "__table_row");

	const seedRows = 2;
	const seedCols = 2;
	const desiredRowCount = Math.max(tableRows.length, 1);
	const desiredColCount = Math.max(
		tableRows.reduce((max, row) => {
			const cellCount = (row.children ?? []).filter(
				(cell) => cell.type === "__table_cell",
			).length;
			return Math.max(max, cellCount);
		}, 0),
		1,
	);

	for (let rowIdx = seedRows - 1; rowIdx >= desiredRowCount; rowIdx -= 1) {
		ops.push({
			type: "delete-table-row",
			blockId,
			index: rowIdx,
		} as DocumentOp);
	}

	for (let colIdx = seedCols - 1; colIdx >= desiredColCount; colIdx -= 1) {
		ops.push({
			type: "delete-table-column",
			blockId,
			index: colIdx,
		} as DocumentOp);
	}

	for (let colIdx = seedCols; colIdx < desiredColCount; colIdx += 1) {
		ops.push({
			type: "insert-table-column",
			blockId,
			index: colIdx,
		} as DocumentOp);
	}

	for (let rowIdx = 0; rowIdx < tableRows.length; rowIdx += 1) {
		const row = tableRows[rowIdx];
		const cells = (row.children ?? []).filter(
			(cell) => cell.type === "__table_cell",
		);

		if (rowIdx >= seedRows) {
			ops.push({
				type: "insert-table-row",
				blockId,
				index: rowIdx,
			} as DocumentOp);
		}

		for (let colIdx = 0; colIdx < cells.length; colIdx += 1) {
			const cell = cells[colIdx];
			materializeTableCellContent(ops, blockId, rowIdx, colIdx, cell);
		}
	}
}

function materializeInlineContent(
	ops: DocumentOp[],
	blockId: string,
	block: PendingBlock,
): void {
	if (block.segments && block.segments.length > 0) {
		let offset = 0;
		for (const segment of block.segments) {
			if (segment.type === "text") {
				if (segment.text.length === 0) {
					continue;
				}
				ops.push({
					type: "insert-text",
					blockId,
					offset,
					text: segment.text,
				});
				if (segment.attributes) {
					ops.push({
						type: "format-text",
						blockId,
						offset,
						length: segment.text.length,
						marks: segment.attributes,
					});
				}
				offset += segment.text.length;
				continue;
			}

			ops.push({
				type: "insert-inline-node",
				blockId,
				offset,
				nodeType: segment.nodeType,
				props: segment.props ?? {},
			});
			offset += 1;
		}
		return;
	}

	if (!block.content) {
		return;
	}

	ops.push({
		type: "insert-text",
		blockId,
		offset: 0,
		text: block.content,
	});

	for (const mark of block.marks ?? []) {
		if (mark.start >= mark.end) continue;
		ops.push({
			type: "format-text",
			blockId,
			offset: mark.start,
			length: mark.end - mark.start,
			marks: { [mark.type]: mark.props ?? true },
		});
	}
}

function materializeTableCellContent(
	ops: DocumentOp[],
	blockId: string,
	row: number,
	col: number,
	cell: PendingBlock,
): void {
	if (cell.segments && cell.segments.length > 0) {
		let offset = 0;
		for (const segment of cell.segments) {
			if (segment.type === "text") {
				if (segment.text.length === 0) {
					continue;
				}
				ops.push({
					type: "insert-table-cell-text",
					blockId,
					row,
					col,
					offset,
					text: segment.text,
				} as DocumentOp);
				if (segment.attributes) {
					ops.push({
						type: "format-table-cell-text",
						blockId,
						row,
						col,
						offset,
						length: segment.text.length,
						marks: segment.attributes,
					} as DocumentOp);
				}
				offset += segment.text.length;
			}
		}
		return;
	}

	if (!cell.content) {
		return;
	}

	ops.push({
		type: "insert-table-cell-text",
		blockId,
		row,
		col,
		offset: 0,
		text: cell.content,
	} as DocumentOp);

	for (const mark of cell.marks ?? []) {
		if (mark.start >= mark.end) continue;
		ops.push({
			type: "format-table-cell-text",
			blockId,
			row,
			col,
			offset: mark.start,
			length: mark.end - mark.start,
			marks: { [mark.type]: mark.props ?? true },
		} as DocumentOp);
	}
}

function cleanProps(props: Record<string, unknown>): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (value !== undefined) {
			cleaned[key] = value;
		}
	}
	return cleaned;
}
