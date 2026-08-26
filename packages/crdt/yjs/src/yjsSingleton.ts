import * as Y from "yjs";

export const YJS_SINGLETON_MISMATCH =
	"Host Y.Doc is not instanceof this adapter's imported Y.Doc. Two copies of yjs are loaded; instanceof fails across module copies. Deduplicate yjs (package manager resolutions / pnpm.overrides) so the host and @input/pen-crdt-yjs share one Y.Doc constructor.";

export function assertAdapterYjsDoc(ydoc: unknown): asserts ydoc is Y.Doc {
	if (!(ydoc instanceof Y.Doc)) {
		throw new Error(YJS_SINGLETON_MISMATCH);
	}
}
