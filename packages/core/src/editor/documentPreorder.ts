import type {
	CRDTArray,
	CRDTMap,
	DocumentState,
	Editor,
	PenDocument,
} from "@input/pen-types";

type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;

/** Nested document order: each `blockOrder` root, then that block's `children` array. */
export function documentPreorderBlockIds(editor: Editor): string[] {
	return documentPreorderBlockIdsFromState(editor.documentState);
}

export function documentPreorderBlockIdsFromState(
	state: DocumentState,
): string[] {
	const ids: string[] = [];
	for (const block of state.blocks) {
		ids.push(block.id);
	}
	return ids;
}

export function documentPreorderBlockIdsFromDoc(doc: PenDocument): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	const blocks = doc.blocks as CRDTBlockMap;
	const order = doc.blockOrder as CRDTArray<string>;

	const walk = (id: string) => {
		if (seen.has(id)) {
			return;
		}
		seen.add(id);
		ids.push(id);
		const blockMap = blocks.get(id);
		const children = blockMap?.get("children") as
			| CRDTArray<string>
			| undefined;
		if (!children) {
			return;
		}
		for (let i = 0; i < children.length; i++) {
			walk(children.get(i));
		}
	};

	for (let i = 0; i < order.length; i++) {
		walk(order.get(i));
	}
	return ids;
}
