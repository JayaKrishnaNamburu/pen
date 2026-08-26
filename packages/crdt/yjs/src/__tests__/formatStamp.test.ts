import { describe, expect, it } from "vitest";
import {
	DOCUMENT_PROFILE_METADATA_KEY,
	PEN_DOCUMENT_FORMAT,
	PEN_FORMAT_METADATA_KEY,
} from "@input/pen-types";

import { yjsAdapter } from "../adapter";
import { createYjsDocument, DOCUMENT_PROFILE } from "../document";
import { readFormatStamp } from "../formatStamp";
import type { YjsCRDTDocument } from "../document";

const SEMVER = /^\d+\.\d+\.\d+/;

describe("format stamp (DUR1)", () => {
	const adapter = yjsAdapter();

	it("DUR1: a new document carries format 2 with minReader 1", () => {
		const doc = adapter.createDocument();
		const stamp = readFormatStamp(doc);

		expect(stamp.format).toBe(PEN_DOCUMENT_FORMAT);
		expect(stamp.minReader).toBe(1);
		expect(stamp.writer).toMatch(SEMVER);
		expect(
			(doc as YjsCRDTDocument).penDocument.metadata.get(
				PEN_FORMAT_METADATA_KEY,
			),
		).toEqual(stamp);
	});

	it("DUR1: an unstamped document reads as format 1 and is stamped after one write", () => {
		const unstamped = createYjsDocument(adapter);
		unstamped.penDocument.metadata.set("hostNote", "keep");
		const loaded = adapter.loadDocument(
			adapter.encodeState(unstamped),
		) as YjsCRDTDocument;

		expect(readFormatStamp(loaded)).toEqual({
			format: 1,
			minReader: 1,
			writer: "unknown",
		});
		expect(
			loaded.penDocument.metadata.get(PEN_FORMAT_METADATA_KEY),
		).toBeUndefined();
		expect(loaded.penDocument.metadata.get("hostNote")).toBe("keep");

		adapter.transact(loaded, () => {
			loaded.penDocument.blockOrder.push(["b1"]);
		});

		const stamp = readFormatStamp(loaded);
		expect(stamp.format).toBe(PEN_DOCUMENT_FORMAT);
		expect(stamp.minReader).toBe(1);
		expect(stamp.writer).toMatch(SEMVER);
		expect(loaded.penDocument.metadata.get("hostNote")).toBe("keep");
		expect(loaded.penDocument.blockOrder.toArray()).toEqual(["b1"]);
	});

	it("DUR1: host metadata keys other than the reserved two stay untouched", () => {
		const doc = adapter.createDocument() as YjsCRDTDocument;
		doc.ydoc.transact(() => {
			doc.penDocument.metadata.set("clientTheme", "dark");
			doc.penDocument.metadata.set(DOCUMENT_PROFILE, "flow");
		});

		adapter.transact(doc, () => {
			doc.penDocument.blockOrder.push(["keep-order"]);
		});

		expect(doc.penDocument.metadata.get("clientTheme")).toBe("dark");
		expect(
			doc.penDocument.metadata.get(DOCUMENT_PROFILE_METADATA_KEY),
		).toBe("flow");
		expect(readFormatStamp(doc).format).toBe(PEN_DOCUMENT_FORMAT);
	});

	it("DUR1: a malformed stamp is treated as implicit v1, not corrupt", () => {
		const unstamped = createYjsDocument(adapter);
		unstamped.penDocument.metadata.set(PEN_FORMAT_METADATA_KEY, "2");
		const loaded = adapter.loadDocument(adapter.encodeState(unstamped));

		expect(readFormatStamp(loaded)).toEqual({
			format: 1,
			minReader: 1,
			writer: "unknown",
		});
	});
});
