import type { ChangeSummary, CRDTEvent, PenDocument } from "@input/pen-types";
import { createSummarySource } from "@input/pen-crdt-yjs";

import {
	createBlockIndex,
	emptyBlockIndexSnapshot,
	type BlockIndex,
} from "./blockIndex";
import { createBlockIndexSnapshotFromDocument } from "./fromDocument";
import { buildChangeSummary } from "./summaryBuilder";

export interface ChangeSummaryHost {
	_doc: PenDocument;
	_crdtDoc: unknown;
	_pendingSummary: ChangeSummary | null;
	_lastChangeSummary: ChangeSummary | null;
	_blockIndex: BlockIndex;
	_unsubSummary: (() => void) | null;
	_deferredCRDTEvent: CRDTEvent | null;
	_dispatchCRDTEvent(event: CRDTEvent): void;
}

export function installChangeSummaries(host: ChangeSummaryHost): void {
	teardownChangeSummaries(host);
	host._pendingSummary = null;
	host._lastChangeSummary = null;
	host._deferredCRDTEvent = null;
	host._blockIndex = createBlockIndex(
		host._doc
			? createBlockIndexSnapshotFromDocument(host._doc)
			: emptyBlockIndexSnapshot(),
	);
	try {
		host._unsubSummary = createSummarySource(host._crdtDoc as never, (delta) => {
			host._pendingSummary = buildChangeSummary(
				delta,
				host._blockIndex.snapshot(),
				0,
			);
			host._blockIndex.replace(
				createBlockIndexSnapshotFromDocument(host._doc),
			);
			flushDeferredCRDTEvent(host);
		});
	} catch {
		host._unsubSummary = null;
	}
}

export function teardownChangeSummaries(host: ChangeSummaryHost): void {
	host._deferredCRDTEvent = null;
	if (!host._unsubSummary) return;
	host._unsubSummary();
	host._unsubSummary = null;
}

function flushDeferredCRDTEvent(host: ChangeSummaryHost): void {
	const deferred = host._deferredCRDTEvent;
	if (!deferred) return;
	host._deferredCRDTEvent = null;
	host._dispatchCRDTEvent(deferred);
}
