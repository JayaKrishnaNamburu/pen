export interface ItemGroup<TItem> {
	group: string;
	items: TItem[];
	indices: number[];
}

export function buildItemGroups<TItem extends { display: { group?: string } }>(
	items: readonly TItem[],
): ItemGroup<TItem>[] {
	const map = new Map<
		string,
		{ items: TItem[]; indices: number[] }
	>();
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const group = item.display.group ?? "Other";
		let entry = map.get(group);
		if (!entry) {
			entry = { items: [], indices: [] };
			map.set(group, entry);
		}
		entry.items.push(item);
		entry.indices.push(i);
	}
	return Array.from(map.entries()).map(([group, data]) => ({
		group,
		items: data.items,
		indices: data.indices,
	}));
}
