import type { StructuralChange } from "./types";

export function composeStructural(
	first: readonly StructuralChange[],
	second: readonly StructuralChange[],
): StructuralChange[] {
	const out: StructuralChange[] = [...first];
	for (const change of second) {
		pushStructural(out, change);
	}
	return out;
}

function pushStructural(out: StructuralChange[], change: StructuralChange): void {
	switch (change.type) {
		case "block-inserted":
			out.push(change);
			return;
		case "block-removed": {
			const inserted = lastIndex(
				out,
				(item) => item.type === "block-inserted" && item.blockId === change.blockId,
			);
			if (inserted >= 0) {
				out.splice(inserted, 1);
				return;
			}
			const moved = lastIndex(
				out,
				(item) => item.type === "block-moved" && item.blockId === change.blockId,
			);
			if (moved >= 0) {
				const prev = out[moved];
				if (prev?.type === "block-moved") {
					out.splice(moved, 1);
					out.push({
						type: "block-removed",
						blockId: change.blockId,
						parentId: prev.fromParentId,
						index: prev.fromIndex,
					});
					return;
				}
			}
			out.push(change);
			return;
		}
		case "block-moved": {
			const inserted = lastIndex(
				out,
				(item) => item.type === "block-inserted" && item.blockId === change.blockId,
			);
			if (inserted >= 0) {
				const prev = out[inserted];
				if (prev?.type === "block-inserted") {
					out[inserted] = {
						type: "block-inserted",
						blockId: change.blockId,
						parentId: change.toParentId,
						index: change.toIndex,
					};
					return;
				}
			}
			const moved = lastIndex(
				out,
				(item) => item.type === "block-moved" && item.blockId === change.blockId,
			);
			if (moved >= 0) {
				const prev = out[moved];
				if (prev?.type === "block-moved") {
					out[moved] = {
						type: "block-moved",
						blockId: change.blockId,
						fromParentId: prev.fromParentId,
						fromIndex: prev.fromIndex,
						toParentId: change.toParentId,
						toIndex: change.toIndex,
					};
					return;
				}
			}
			out.push(change);
			return;
		}
		case "block-converted": {
			const converted = lastIndex(
				out,
				(item) => item.type === "block-converted" && item.blockId === change.blockId,
			);
			if (converted >= 0) {
				const prev = out[converted];
				if (prev?.type === "block-converted") {
					out[converted] = {
						type: "block-converted",
						blockId: change.blockId,
						fromType: prev.fromType,
						toType: change.toType,
					};
					return;
				}
			}
			out.push(change);
			return;
		}
		case "block-props-changed": {
			const props = lastIndex(
				out,
				(item) => item.type === "block-props-changed" && item.blockId === change.blockId,
			);
			if (props >= 0) {
				const prev = out[props];
				if (prev?.type === "block-props-changed") {
					out[props] = {
						type: "block-props-changed",
						blockId: change.blockId,
						keys: unique([...prev.keys, ...change.keys]),
					};
					return;
				}
			}
			out.push(change);
			return;
		}
		case "apps-changed": {
			const apps = lastIndex(out, (item) => item.type === "apps-changed");
			if (apps >= 0) {
				const prev = out[apps];
				if (prev?.type === "apps-changed") {
					out[apps] = {
						type: "apps-changed",
						appIds: unique([...prev.appIds, ...change.appIds]),
					};
					return;
				}
			}
			out.push(change);
			return;
		}
		case "metadata-changed": {
			const meta = lastIndex(out, (item) => item.type === "metadata-changed");
			if (meta >= 0) {
				const prev = out[meta];
				if (prev?.type === "metadata-changed") {
					out[meta] = {
						type: "metadata-changed",
						namespaces: unique([...prev.namespaces, ...change.namespaces]),
					};
					return;
				}
			}
			out.push(change);
			return;
		}
		case "table-changed":
		case "block-split":
		case "blocks-merged":
			out.push(change);
			return;
		default: {
			const _exhaustive: never = change;
			return _exhaustive;
		}
	}
}

function lastIndex(
	items: readonly StructuralChange[],
	match: (item: StructuralChange) => boolean,
): number {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item && match(item)) return i;
	}
	return -1;
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}
