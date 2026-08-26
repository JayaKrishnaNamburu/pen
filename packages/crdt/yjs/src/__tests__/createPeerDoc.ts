import type { CRDTAdapter } from "@input/pen-types";

import { createYjsDocument } from "../document";
import type { YjsCRDTDocument } from "../document";
import { forkDocument } from "../snapshots";

// Yjs breaks ties between concurrent inserts at the same position by client
// id, and last-writer-wins map keys by the higher client id. Peers that race
// need pinned ids or the merged result is a coin flip.
export function createPeerDoc(
	adapter: CRDTAdapter,
	clientId?: number,
): YjsCRDTDocument {
	const doc = createYjsDocument(adapter);
	if (clientId !== undefined) {
		doc.ydoc.clientID = clientId;
	}
	return doc;
}

export function forkPeerDoc(
	adapter: CRDTAdapter,
	source: YjsCRDTDocument,
	clientId: number,
): YjsCRDTDocument {
	const forked = forkDocument(adapter, source);
	forked.ydoc.clientID = clientId;
	return forked;
}
