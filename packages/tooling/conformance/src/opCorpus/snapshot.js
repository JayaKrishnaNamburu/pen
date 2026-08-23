import * as Y from "yjs";

function toPlain(value) {
	if (value instanceof Y.Text) {
		return { kind: "text", delta: value.toDelta() };
	}
	if (value instanceof Y.Array) {
		return value.toArray().map(toPlain);
	}
	if (value instanceof Y.Map) {
		const out = {};
		for (const [key, child] of value.entries()) {
			out[key] = toPlain(child);
		}
		return out;
	}
	if (value instanceof Y.Doc) {
		return { kind: "subdoc", guid: value.guid };
	}
	if (Array.isArray(value)) {
		return value.map(toPlain);
	}
	if (value != null && typeof value === "object") {
		const out = {};
		for (const [key, child] of Object.entries(value)) {
			out[key] = toPlain(child);
		}
		return out;
	}
	return value;
}

function sortKeys(value) {
	if (Array.isArray(value)) {
		return value.map(sortKeys);
	}
	if (value != null && typeof value === "object") {
		const out = {};
		for (const key of Object.keys(value).sort()) {
			out[key] = sortKeys(value[key]);
		}
		return out;
	}
	return value;
}

export function snapshotDocument(_editor, ydoc) {
	const blocksMap = ydoc.getMap("blocks");
	const blocks = {};
	for (const [id, blockMap] of blocksMap.entries()) {
		blocks[id] = toPlain(blockMap);
	}
	return sortKeys({
		blockOrder: ydoc.getArray("blockOrder").toArray(),
		blocks,
		apps: toPlain(ydoc.getMap("apps")),
		metadata: toPlain(ydoc.getMap("metadata")),
	});
}

export function snapshotSelection(editor) {
	return sortKeys(JSON.parse(JSON.stringify(editor.selection)));
}

export function encodeUpdateBytes(bytes) {
	return Buffer.from(bytes).toString("base64");
}

export function decodeUpdateBytes(base64) {
	return Uint8Array.from(Buffer.from(base64, "base64"));
}
