import type { ChangeSummary, CRDTEvent, PenDocument } from "@input/pen-types";
import { createSummarySource } from "@input/pen-yjs";

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
	_engine: { notifyStructureChanged(): void };
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
		host._unsubSummary = createSummarySource(
			host._crdtDoc as never,
			(delta) => {
				// Normalization only runs inside a local apply, so a remote or
				// undo transaction is the one structural change its pass index
				// never hears about at the mutation site.
				if (
					delta.blockOrderDelta.length > 0 ||
					delta.childArrayDeltas.size > 0
				) {
					host._engine.notifyStructureChanged();
				}

				const summary = buildChangeSummary(
					delta,
					host._blockIndex.snapshot(),
					0,
				);
				host._pendingSummary = summary;
				// A text-only commit moves lengths and nothing else, so the
				// index advances in place. Rebuilding it from the document
				// would read every block's text on every keystroke (SCALE2).
				if (summary.structural.length === 0) {
					host._blockIndex.applyTextLengths(summary.blockText);
				} else {
					host._blockIndex.replace(
						createBlockIndexSnapshotFromDocument(host._doc),
					);
				}
				flushDeferredCRDTEvent(host);
			},
		);
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
