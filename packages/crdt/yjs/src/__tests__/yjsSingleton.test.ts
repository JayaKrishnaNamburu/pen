import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { yjsAdapter } from "../adapter";
import { wrapYjsDocument } from "../document";
import { YJS_SINGLETON_MISMATCH } from "../yjsSingleton";

describe("API2", () => {
  const adapter = yjsAdapter();

  // Two real yjs copies cannot be installed in-session. A constructor-mismatch
  // mock stands in: anything that is not instanceof the adapter's imported Y.Doc.
  it("throws when a fake Doc is not instanceof the adapter's Y.Doc", () => {
    class FakeDoc {}
    const fakeDoc = new FakeDoc() as unknown as Y.Doc;

    expect(() => wrapYjsDocument(adapter, fakeDoc)).toThrow(
      YJS_SINGLETON_MISMATCH,
    );
    expect(YJS_SINGLETON_MISMATCH).toMatch(/two copies of yjs/i);
    expect(YJS_SINGLETON_MISMATCH).toMatch(/resolutions/i);
  });

  it("accepts a Y.Doc constructed from the adapter's import", () => {
    const ydoc = new Y.Doc();
    expect(wrapYjsDocument(adapter, ydoc).ydoc).toBe(ydoc);
  });
});
