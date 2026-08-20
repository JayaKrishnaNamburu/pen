import { describe, expect, it } from "vitest";
import {
	PEN_DOCUMENT_FORMAT,
	PEN_FORMAT_METADATA_KEY,
} from "@input/pen-types";

import { yjsAdapter } from "../adapter";
import { createYjsDocument } from "../document";
import type { YjsCRDTDocument } from "../document";
import { readFormatStamp, refreshFormatStamp } from "../formatStamp";

const SEMVER = /^\d+\.\d+\.\d+/;

describe("format stamp leftovers (DUR1)", () => {
	const adapter = yjsAdapter();

	it("DUR1: refreshFormatStamp is the first-write seam for an unstamped document", () => {
		const unstamped = createYjsDocument(adapter);

		expect(readFormatStamp(unstamped)).toEqual({
			format: 1,
			minReader: 1,
			writer: "unknown",
		});
		expect(
			unstamped.penDocument.metadata.get(PEN_FORMAT_METADATA_KEY),
		).toBeUndefined();

		refreshFormatStamp(unstamped);

		const stamp = readFormatStamp(unstamped);
		expect(stamp.format).toBe(PEN_DOCUMENT_FORMAT);
		expect(stamp.minReader).toBe(1);
		expect(stamp.writer).toMatch(SEMVER);
		expect(unstamped.penDocument.metadata.get(PEN_FORMAT_METADATA_KEY)).toEqual(
			stamp,
		);
	});

	it("DUR1: a matching stamp is not rewritten on the first user write", () => {
		const doc = adapter.createDocument() as YjsCRDTDocument;
		const before = readFormatStamp(doc);
		let metadataWrites = 0;
		doc.penDocument.metadata.observe(() => {
			metadataWrites += 1;
		});

		adapter.transact(doc, () => {
			doc.penDocument.blockOrder.push(["keep"]);
		});

		expect(metadataWrites).toBe(0);
		expect(readFormatStamp(doc)).toEqual(before);
		expect(doc.penDocument.blockOrder.toArray()).toEqual(["keep"]);
	});
});
