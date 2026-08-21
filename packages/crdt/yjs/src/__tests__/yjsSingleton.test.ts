import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { wrapYjsDocument } from "../document";
import { YJS_SINGLETON_MISMATCH } from "../yjsSingleton";
import { loadDuplicateYjs } from "./fixtures/yjs-duplicate/load";

describe("API2", () => {
  const adapter = yjsAdapter();

  // Cheap stand-in: anything that is not instanceof the adapter's Y.Doc.
  // The inlined-copy case below is the real two-module check.
  it("throws when a fake Doc is not instanceof the adapter's Y.Doc", () => {
    class FakeDoc {}
    const fakeDoc = new FakeDoc() as unknown as Y.Doc;

    expect(() => wrapYjsDocument(adapter, fakeDoc)).toThrow(
      YJS_SINGLETON_MISMATCH,
    );
    expect(YJS_SINGLETON_MISMATCH).toMatch(/two copies of yjs/i);
    expect(YJS_SINGLETON_MISMATCH).toMatch(/resolutions/i);
  });

  it("throws when a Doc is constructed by a second inlined yjs copy", async () => {
    const { Doc: DuplicateDoc } = await loadDuplicateYjs();

    // If this fails, the fixture collapsed to one module (the npm: alias
    // failure mode). A green wrap after that would not be a two-copy test.
    expect(Y.Doc).not.toBe(DuplicateDoc);

    const duplicateDoc = new DuplicateDoc();
    expect(typeof duplicateDoc.getArray).toBe("function");
    expect(duplicateDoc instanceof Y.Doc).toBe(false);
    expect(() =>
      wrapYjsDocument(adapter, duplicateDoc as unknown as Y.Doc),
    ).toThrow(YJS_SINGLETON_MISMATCH);
  });

  it("accepts a Y.Doc constructed from the adapter's import", () => {
    const ydoc = new Y.Doc();
    expect(wrapYjsDocument(adapter, ydoc).ydoc).toBe(ydoc);
  });
});
