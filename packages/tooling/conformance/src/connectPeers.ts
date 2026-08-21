import * as Y from "yjs";

/**
 * Live Yjs update bridge used by the harness session. Extracted so a
 * quiet no-op is visible in the node suite — the same class of bug as
 * `createTestCollaboration` seeding two unsynced documents.
 */
export function connectPeers(localY: Y.Doc, remoteY: Y.Doc): () => void {
	const onLocal = (update: Uint8Array, origin: unknown) => {
		if (origin === remoteY) {
			return;
		}
		Y.applyUpdate(remoteY, update, localY);
	};
	const onRemote = (update: Uint8Array, origin: unknown) => {
		if (origin === localY) {
			return;
		}
		Y.applyUpdate(localY, update, remoteY);
	};
	localY.on("update", onLocal);
	remoteY.on("update", onRemote);
	return () => {
		localY.off("update", onLocal);
		remoteY.off("update", onRemote);
	};
}
