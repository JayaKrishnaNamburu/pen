import type {
	DatabaseViewState,
	InlineDelta,
	InlineNodeDeltaInsert,
	TableColumnSchema,
} from "@pen/types";
import {
	crdtMapToPlainRecord,
	crdtValueToPlain,
	getArrayProp,
	getMapProp,
	type CRDTTextLike,
	type CRDTUnknownArray,
	type CRDTUnknownMap,
} from "../editor/crdtShapes";

type TextDelta = {
	insert: unknown;
	attributes?: Record<string, unknown>;
};

export function getMapEntries(
	map: CRDTUnknownMap | null,
): Iterable<[string, unknown]> {
	return map?.entries?.() ?? [];
}

export function getChildrenArray(
	blockMap: CRDTUnknownMap,
): CRDTUnknownArray<string> | null {
	return getArrayProp<string>(blockMap, "children");
}

export function getPropsMap(blockMap: CRDTUnknownMap): CRDTUnknownMap | null {
	return getMapProp(blockMap, "props");
}

export function getDeltaFragments(text: CRDTTextLike | null): TextDelta[] {
	return typeof text?.toDelta === "function" ? text.toDelta() : [];
}

function toInlineDeltaInsert(value: unknown): string | InlineNodeDeltaInsert {
	if (typeof value === "string") {
		return value;
	}
	if (!value || typeof value !== "object") {
		return "";
	}
	const record = value as Record<string, unknown>;
	const type = typeof record.type === "string" ? record.type : "";
	if (!type) {
		return "";
	}
	const props: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(record)) {
		if (key === "type") {
			continue;
		}
		props[key] = entry;
	}
	return { type, props };
}

export function toInlineDeltas(content: CRDTTextLike | null): InlineDelta[] {
	if (typeof content?.toDelta !== "function") {
		return [];
	}
	return getDeltaFragments(content).map((delta) => ({
		insert: toInlineDeltaInsert(delta.insert),
		...(delta.attributes ? { attributes: delta.attributes } : {}),
	}));
}

export function arrayValues<T>(array: CRDTUnknownArray<T>): T[] {
	return (
		array.toArray?.() ??
		Array.from({ length: array.length }, (_, index) => array.get(index))
	);
}

export function resolveText(content: CRDTTextLike): string {
	const deltas = getDeltaFragments(content);
	let result = "";
	for (const d of deltas) {
		if (typeof d.insert !== "string") continue;
		const suggestion = d.attributes?.suggestion as
			| { action?: string }
			| undefined;
		if (suggestion?.action === "delete") continue;
		result += d.insert;
	}
	return result;
}

export function toTableColumnSchema(column: unknown): TableColumnSchema | null {
	if (!column || typeof column !== "object") return null;
	const mapLike = column as {
		get?: (key: string) => unknown;
		entries?: () => IterableIterator<[string, unknown]>;
	};
	const id = mapLike.get?.("id");
	const title = mapLike.get?.("title");
	const type = mapLike.get?.("type");
	if (
		typeof id !== "string" ||
		typeof title !== "string" ||
		typeof type !== "string"
	) {
		return null;
	}
	const options = toPlainArray(mapLike.get?.("options"));
	return {
		id,
		title,
		type: type as TableColumnSchema["type"],
		width: toNumber(mapLike.get?.("width")),
		hidden: toBoolean(mapLike.get?.("hidden")),
		pinned: toPinned(mapLike.get?.("pinned")),
		options,
		format: (toPlainObject(mapLike.get?.("format")) ??
			undefined) as TableColumnSchema["format"],
		readonly: toBoolean(mapLike.get?.("readonly")),
	};
}

export function toDatabaseViewState(view: unknown): DatabaseViewState | null {
	if (!view || typeof view !== "object") return null;
	const mapLike = view as {
		get?: (key: string) => unknown;
	};
	const id = mapLike.get?.("id");
	const type = mapLike.get?.("type");
	if (typeof id !== "string" || typeof type !== "string") {
		return null;
	}

	const filterValue = toPlainObject(mapLike.get?.("filter"));

	return {
		id,
		title: toString(mapLike.get?.("title")),
		type: type as DatabaseViewState["type"],
		visibleColumnIds: toStringArray(mapLike.get?.("visibleColumnIds")),
		columnOrder: toStringArray(mapLike.get?.("columnOrder")),
		sort: toPlainArray(mapLike.get?.("sort")) as DatabaseViewState["sort"],
		filter: (filterValue as DatabaseViewState["filter"] | null) ?? null,
		groupBy: toNullableString(mapLike.get?.("groupBy")),
		rowPinning: toDatabaseRowPinning(mapLike.get?.("rowPinning")),
		pageIndex: toNumber(mapLike.get?.("pageIndex")),
		pageSize: toNumber(mapLike.get?.("pageSize")),
	};
}

function toDatabaseRowPinning(
	value: unknown,
): DatabaseViewState["rowPinning"] {
	if (!value || typeof value !== "object") {
		return undefined;
	}
	const mapLike = value as {
		get?: (key: string) => unknown;
	};
	const topValues = toStringArray(mapLike.get?.("top"));
	const bottomValues = toStringArray(mapLike.get?.("bottom"));
	const top = topValues && topValues.length > 0 ? topValues : undefined;
	const bottom =
		bottomValues && bottomValues.length > 0 ? bottomValues : undefined;
	if (!top && !bottom) {
		return undefined;
	}
	return {
		top,
		bottom,
	};
}

function toPlainArray(value: unknown): TableColumnSchema["options"] {
	if (
		!value ||
		typeof (value as { toArray?: () => unknown[] }).toArray !== "function"
	) {
		return undefined;
	}
	const items = (value as { toArray: () => unknown[] }).toArray();
	return items
		.map((item) => crdtValueToPlain(item))
		.filter((item): item is Record<string, unknown> => item !== null)
		.map(
			(item) =>
				item as unknown as NonNullable<TableColumnSchema["options"]>[number],
		);
}

function toPlainObject(value: unknown): Record<string, unknown> | null {
	return crdtMapToPlainRecord(value);
}

function toNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function toString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function toNullableString(value: unknown): string | null | undefined {
	if (value === null) return null;
	return typeof value === "string" ? value : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
	if (
		!value ||
		typeof (value as { toArray?: () => unknown[] }).toArray !== "function"
	) {
		return undefined;
	}
	return (value as { toArray: () => unknown[] })
		.toArray()
		.filter((entry): entry is string => typeof entry === "string");
}

function toBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function toPinned(value: unknown): "left" | "right" | undefined {
	return value === "left" || value === "right" ? value : undefined;
}
