import type { InlineDelta, TableCellHandle } from "@pen/types";
import {
	getStringProp,
	getTextProp,
	type TableCellMap,
} from "../editor/crdtShapes";
import { getDeltaFragments, toInlineDeltas } from "./handleValueHelpers";

export class TableCellHandleImpl implements TableCellHandle {
	constructor(
		private readonly _cellMap: TableCellMap,
		private readonly _row: number,
		private readonly _col: number,
	) {}

	get id(): string {
		return getStringProp(this._cellMap, "id") ?? "";
	}

	get row(): number {
		return this._row;
	}

	get col(): number {
		return this._col;
	}

	textContent(): string {
		const content = getTextProp(this._cellMap, "content");
		if (content) {
			const text = content.toString();
			if (text === "\u200B") return "";
			return text;
		}
		return "";
	}

	length(): number {
		const content = getTextProp(this._cellMap, "content");
		if (typeof content?.toDelta === "function") {
			return getDeltaFragments(content).reduce((total: number, delta) => {
				if (typeof delta.insert === "string") {
					return total + delta.insert.length;
				}
				return total + 1;
			}, 0);
		}
		return this.textContent().length;
	}

	inlineDeltas(): InlineDelta[] {
		const content = getTextProp(this._cellMap, "content");
		return toInlineDeltas(content);
	}

	textDeltas(): Array<{
		insert: string;
		attributes?: Record<string, unknown>;
	}> {
		return this.inlineDeltas().map((delta) => ({
			insert: typeof delta.insert === "string" ? delta.insert : "",
			...(delta.attributes ? { attributes: delta.attributes } : {}),
		}));
	}
}
