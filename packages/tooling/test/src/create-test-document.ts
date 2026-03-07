import * as Y from "yjs";
import { yjsAdapter, initBlockMap, wrapYjsDocument } from "@pen/crdt-yjs";
import type { PenDocument, CRDTDocument } from "@pen/types";
import { generateTestId } from "./helpers.js";
import type { TestBlock } from "./types.js";

const NONE_CONTENT_TYPES = new Set(["image", "divider"]);
const TABLE_CONTENT_TYPES = new Set(["table"]);

function resolveContentType(
	block: TestBlock,
): "inline" | "table" | "nested" | "none" {
	if (block.children) return "nested";
	if (NONE_CONTENT_TYPES.has(block.type)) return "none";
	if (TABLE_CONTENT_TYPES.has(block.type)) return "table";
	return "inline";
}

function populateBlock(
	blocksMap: Y.Map<unknown>,
	block: TestBlock,
	id: string,
): void {
	const contentType = resolveContentType(block);
	initBlockMap(blocksMap as any, id, block.type, contentType);
	const blockMap = blocksMap.get(id) as Y.Map<unknown>;

	if (block.props && Object.keys(block.props).length > 0) {
		const propsMap = blockMap.get("props") as Y.Map<unknown>;
		for (const [key, value] of Object.entries(block.props)) {
			propsMap.set(key, value);
		}
	}

	if (block.content !== undefined) {
		const content = blockMap.get("content") as Y.Text | undefined;
		if (content) {
			content.insert(0, block.content);
		}
	}
}

export function populateYDoc(ydoc: Y.Doc, blocks: TestBlock[]): void {
	const blockOrder = ydoc.getArray<string>("blockOrder");
	const blocksMap = ydoc.getMap("blocks");
	ydoc.getMap("apps");
	ydoc.getMap("metadata");

	ydoc.transact(() => {
		for (const block of blocks) {
			const id = block.id ?? generateTestId();
			blockOrder.push([id]);
			populateBlock(blocksMap, block, id);

			if (block.children) {
				const blockMap = blocksMap.get(id) as Y.Map<unknown>;
				const childrenArr = blockMap.get("children") as Y.Array<string>;
				for (const child of block.children) {
					const childId = child.id ?? generateTestId();
					childrenArr.push([childId]);
					const childContentType = resolveContentType(child);
					initBlockMap(
						blocksMap as any,
						childId,
						child.type,
						childContentType,
					);
					const childMap = blocksMap.get(childId) as Y.Map<unknown>;
					if (child.props && Object.keys(child.props).length > 0) {
						const childPropsMap = childMap.get(
							"props",
						) as Y.Map<unknown>;
						for (const [key, value] of Object.entries(
							child.props,
						)) {
							childPropsMap.set(key, value);
						}
					}
					if (child.content !== undefined) {
						const childContent = childMap.get("content") as
							| Y.Text
							| undefined;
						if (childContent) {
							childContent.insert(0, child.content);
						}
					}
				}
			}
		}
	});
}

export function createTestDocument(blocks: TestBlock[]): {
	ydoc: Y.Doc;
	doc: PenDocument;
	crdtDoc: CRDTDocument;
} {
	const ydoc = new Y.Doc();
	const adapter = yjsAdapter();

	populateYDoc(ydoc, blocks);

	const crdtDoc = wrapYjsDocument(adapter, ydoc);
	return {
		ydoc,
		doc: (crdtDoc as any).penDocument,
		crdtDoc,
	};
}
