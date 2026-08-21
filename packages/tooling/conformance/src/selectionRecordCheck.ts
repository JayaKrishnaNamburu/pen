import type { SerializedSelectionRecord } from "./types";

export type RecordPresence = "present" | "missing";

export type RecordCheck = {
	ok: boolean;
	skipped?: boolean;
	reason?: string;
};

export function recordPresence(
	record: SerializedSelectionRecord | null | undefined,
): RecordPresence {
	return record == null ? "missing" : "present";
}

/**
 * Origin must be readable to count as a check. A missing record is
 * unchecked, not a match — the skip-as-success hole this package already
 * closed for DOM↔authority.
 */
export function originHolds(
	record: SerializedSelectionRecord | null | undefined,
	expected: string,
): RecordCheck {
	if (record == null) {
		return {
			ok: false,
			skipped: true,
			reason: "selectionRecord is not available",
		};
	}
	if (record.origin !== expected) {
		return {
			ok: false,
			reason: `origin is ${record.origin}, expected ${expected}`,
		};
	}
	return { ok: true };
}

export type CaretShiftCheck = RecordCheck & {
	beforeOffset?: number;
	afterOffset?: number;
};

/**
 * A remapping commit must move the caret. Same offset before and after
 * is unchecked (identity map, or the insert never reached the authority)
 * — not a mapped-origin success.
 */
export function caretShiftHolds(
	before: SerializedSelectionRecord | null | undefined,
	after: SerializedSelectionRecord | null | undefined,
	expectedFocusOffset: number,
): CaretShiftCheck {
	if (before == null || after == null) {
		return {
			ok: false,
			skipped: true,
			reason: "selectionRecord is not available",
		};
	}
	if (before.state?.type !== "text" || after.state?.type !== "text") {
		return {
			ok: false,
			skipped: true,
			reason: "caret shift needs a text selection on both records",
		};
	}
	const beforeOffset = before.state.focus.offset;
	const afterOffset = after.state.focus.offset;
	if (afterOffset === beforeOffset) {
		return {
			ok: false,
			skipped: true,
			beforeOffset,
			afterOffset,
			reason: `caret stayed at ${afterOffset} — could not check a remapping write`,
		};
	}
	if (afterOffset !== expectedFocusOffset) {
		return {
			ok: false,
			beforeOffset,
			afterOffset,
			reason: `caret moved ${beforeOffset} → ${afterOffset}, expected ${expectedFocusOffset}`,
		};
	}
	return { ok: true, beforeOffset, afterOffset };
}

export type RecordSample = {
	version: number;
	commitId: number;
};

/**
 * S6: version and commitId never decrease. Fewer than two samples, or a
 * sequence where neither field ever increases, is unchecked — a no-op
 * walk would otherwise pass.
 */
export function monotonicHolds(samples: readonly RecordSample[]): RecordCheck {
	if (samples.length < 2) {
		return {
			ok: false,
			skipped: true,
			reason: "need at least two records to check monotonicity",
		};
	}
	for (let index = 1; index < samples.length; index += 1) {
		const previous = samples[index - 1];
		const current = samples[index];
		if (previous === undefined || current === undefined) {
			return {
				ok: false,
				skipped: true,
				reason: "monotonic sample list is sparse",
			};
		}
		if (current.version < previous.version) {
			return {
				ok: false,
				reason: `version decreased ${previous.version} → ${current.version}`,
			};
		}
		if (current.commitId < previous.commitId) {
			return {
				ok: false,
				reason: `commitId decreased ${previous.commitId} → ${current.commitId}`,
			};
		}
	}
	const first = samples[0];
	const last = samples[samples.length - 1];
	if (first === undefined || last === undefined) {
		return {
			ok: false,
			skipped: true,
			reason: "monotonic sample list is sparse",
		};
	}
	if (last.version <= first.version && last.commitId <= first.commitId) {
		return {
			ok: false,
			skipped: true,
			reason: "version and commitId never increased — could not check S6",
		};
	}
	return { ok: true };
}
