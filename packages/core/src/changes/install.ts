import type { PenDocument } from "@input/pen-types";
import { createSummarySource } from "@input/pen-crdt-yjs";

import {
	createBlockIndex,
	emptyBlockIndexSnapshot,
	type BlockIndex,
} from "./blockIndex";
import { createBlockIndexSnapshotFromDocument } from "./fromDocument";
import { buildChangeSummary } from "./summaryBuilder";
import { createSummaryLog, type SummaryLog } from "./summaryLog";

export interface ChangeSummaryHost {
	_doc: PenDocument;
	_crdtDoc: unknown;
	_summaryLog: SummaryLog;
	_blockIndex: BlockIndex;
	_unsubSummary: (() => void) | null;
	_summaryCommitId: number;
}

export function installChangeSummaries(host: ChangeSummaryHost): void {
	teardownChangeSummaries(host);
	host._summaryLog = createSummaryLog();
	host._summaryCommitId = 0;
	host._blockIndex = createBlockIndex(
		host._doc
			? createBlockIndexSnapshotFromDocument(host._doc)
			: emptyBlockIndexSnapshot(),
	);
	try {
		host._unsubSummary = createSummarySource(host._crdtDoc as never, (delta) => {
			const commitId = ++host._summaryCommitId;
			const summary = buildChangeSummary(
				delta,
				host._blockIndex.snapshot(),
				commitId,
			);
			host._summaryLog.append(summary);
			host._blockIndex.apply(summary);
		});
	} catch {
		// I1: summary source install failed; host stays without incremental summaries.
		host._unsubSummary = null;
	}
}

export function teardownChangeSummaries(host: ChangeSummaryHost): void {
	if (!host._unsubSummary) return;
	host._unsubSummary();
	host._unsubSummary = null;
}
