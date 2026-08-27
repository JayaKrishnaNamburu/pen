#!/usr/bin/env node
/**
 * DUR7 corpus generator — the only supported way to rewrite committed fixtures.
 *
 * Usage (from this directory or the package root):
 *   node src/fixtures/durability/generate.mjs
 *
 * Requires built workspace packages (`@input/pen-core`, `@input/pen-yjs`,
 * `@input/pen-schema`, `@input/pen-interop/json`). Regeneration belongs
 * in a PR with a written reason; the suite must not rewrite fixtures on failure.
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Y from "yjs";
import { createHeadlessEditor } from "@input/pen-core";
import { initBlockMap, wrapYjsDocument, yjsAdapter } from "@input/pen-yjs";
import { exportEditorToJson } from "@input/pen-interop/json";
import { defaultSchema } from "@input/pen-schema";
import { DUR7_CORPUS } from "./catalog.mjs";

const NONE_CONTENT_TYPES = new Set(["image", "divider"]);
const TABLE_CONTENT_TYPES = new Set(["table"]);
const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * @param {{ type: string; children?: unknown }} block
 * @returns {"inline" | "table" | "nested" | "none"}
 */
function resolveContentType(block) {
	if (block.children) return "nested";
	if (NONE_CONTENT_TYPES.has(block.type)) return "none";
	if (TABLE_CONTENT_TYPES.has(block.type)) return "table";
	return "inline";
}

/**
 * Mirrors `populateYDoc` in `createTestDocument.ts` so generated snapshots
 * match the test harness path.
 *
 * @param {Y.Doc} ydoc
 * @param {readonly { id: string; type: string; props?: Record<string, unknown>; content?: string; children?: readonly object[] }[]} blocks
 */
function populateYDoc(ydoc, blocks) {
	const blockOrder = ydoc.getArray("blockOrder");
	const blocksMap = ydoc.getMap("blocks");
	ydoc.getMap("apps");
	ydoc.getMap("metadata");

	ydoc.transact(() => {
		for (const block of blocks) {
			const id = block.id;
			blockOrder.push([id]);
			const contentType = resolveContentType(block);
			initBlockMap(blocksMap, id, block.type, contentType);
			const blockMap = blocksMap.get(id);
			if (block.props && Object.keys(block.props).length > 0) {
				const propsMap = blockMap.get("props");
				for (const [key, value] of Object.entries(block.props)) {
					propsMap.set(key, value);
				}
			}
			if (block.content !== undefined) {
				const content = blockMap.get("content");
				if (content) {
					content.insert(0, block.content);
				}
			}
			if (block.children) {
				const childrenArr = blockMap.get("children");
				for (const child of block.children) {
					const childId = child.id;
					childrenArr.push([childId]);
					const childContentType = resolveContentType(child);
					initBlockMap(blocksMap, childId, child.type, childContentType);
					const childMap = blocksMap.get(childId);
					if (child.props && Object.keys(child.props).length > 0) {
						const childPropsMap = childMap.get("props");
						for (const [key, value] of Object.entries(child.props)) {
							childPropsMap.set(key, value);
						}
					}
					if (child.content !== undefined) {
						const childContent = childMap.get("content");
						if (childContent) {
							childContent.insert(0, child.content);
						}
					}
				}
			}
		}
	});
}

/**
 * @param {readonly { id: string; type: string; props?: Record<string, unknown>; content?: string; children?: readonly object[] }[]} blocks
 */
function createCorpusEditor(blocks) {
	const ydoc = new Y.Doc({ gc: false });
	const adapter = yjsAdapter();
	populateYDoc(ydoc, blocks);
	return createHeadlessEditor({
		crdt: adapter,
		document: wrapYjsDocument(adapter, ydoc),
		schema: defaultSchema,
	});
}

/**
 * @param {unknown} value
 */
function stableStringify(value) {
	return `${JSON.stringify(value, null, "\t")}\n`;
}

async function main() {
	for (const fixture of DUR7_CORPUS) {
		const editor = createCorpusEditor(fixture.blocks);
		editor.normalizeAll();
		const snapshot = {
			id: fixture.id,
			rule: "DUR7",
			shape: fixture.shape,
			kind: "json-export-snapshot",
			document: exportEditorToJson(editor),
		};
		editor.destroy();
		const path = join(FIXTURE_DIR, `${fixture.id}.json`);
		await writeFile(path, stableStringify(snapshot), "utf8");
		console.log(`wrote ${fixture.id}.json`);
	}
}

await main();
