import { createEmptySummary } from "./mapping";
import type { ChangeSummary } from "./types";

export const SUMMARY_LOG_CAPACITY = 256;

export interface SummaryLog {
	append(summary: ChangeSummary): void;
	latest(): ChangeSummary | null;
	between(fromCommitId: number, toCommitId: number): ChangeSummary | null;
}

export function createSummaryLog(
	capacity: number = SUMMARY_LOG_CAPACITY,
): SummaryLog {
	const summaries: ChangeSummary[] = [];
	const byCommitId = new Map<number, ChangeSummary>();
	const composeMemo = new Map<string, ChangeSummary>();
	let latestSummary: ChangeSummary | null = null;

	function evictIfNeeded(): void {
		while (summaries.length > capacity) {
			const evicted = summaries.shift();
			if (!evicted) break;
			byCommitId.delete(evicted.commitId);
			for (const key of composeMemo.keys()) {
				if (keyIncludesCommit(key, evicted.commitId)) {
					composeMemo.delete(key);
				}
			}
		}
	}

	function composeWindow(slice: ChangeSummary[]): ChangeSummary {
		if (slice.length === 1) return slice[0]!;
		const key = `${slice[0]!.commitId}:${slice[slice.length - 1]!.commitId}`;
		const cached = composeMemo.get(key);
		if (cached) return cached;
		const mid = slice.length >> 1;
		const composed = composeWindow(slice.slice(0, mid)).compose(
			composeWindow(slice.slice(mid)),
		);
		composeMemo.set(key, composed);
		return composed;
	}

	return {
		append(summary) {
			summaries.push(summary);
			byCommitId.set(summary.commitId, summary);
			latestSummary = summary;
			evictIfNeeded();
		},
		latest() {
			return latestSummary;
		},
		between(fromCommitId, toCommitId) {
			if (toCommitId < fromCommitId) return null;
			if (toCommitId === fromCommitId) {
				if (summaries.length === 0) return createEmptySummary(fromCommitId);
				const first = summaries[0]!;
				const last = summaries[summaries.length - 1]!;
				if (fromCommitId < first.commitId - 1 || fromCommitId > last.commitId) {
					return null;
				}
				return createEmptySummary(fromCommitId);
			}

			const needed = toCommitId - fromCommitId;
			const slice: ChangeSummary[] = [];
			for (let commitId = fromCommitId + 1; commitId <= toCommitId; commitId++) {
				const summary = byCommitId.get(commitId);
				if (!summary) return null;
				slice.push(summary);
			}
			if (slice.length !== needed) return null;
			return composeWindow(slice);
		},
	};
}

function keyIncludesCommit(key: string, commitId: number): boolean {
	const [from, to] = key.split(":");
	const start = Number(from);
	const end = Number(to);
	return commitId >= start && commitId <= end;
}
