import type { ImportResult, Editor } from "@input/pen-types";
import {
	INGEST_FORBIDDEN_KEYS,
	INGEST_MAX_IMAGE_COUNT,
	INGEST_MAX_NESTING_DEPTH,
	INGEST_MAX_NODE_COUNT,
	INGEST_MAX_TEXT_SIZE,
} from "../../ingestBounds";

export {
	INGEST_FORBIDDEN_KEYS,
	INGEST_MAX_IMAGE_COUNT,
	INGEST_MAX_NESTING_DEPTH,
	INGEST_MAX_NODE_COUNT,
	INGEST_MAX_TEXT_SIZE,
	INGEST_TIME_BUDGET_MS,
} from "../../ingestBounds";

export type IngestDropReason =
	| "unknown-block-type"
	| "profile-disallowed"
	| "depth-exceeded"
	| "count-exceeded"
	| "text-size-exceeded"
	| "image-count-exceeded"
	| "invalid-props"
	| "forbidden-key";

const BOUND_BY_REASON: Partial<Record<IngestDropReason, string>> = {
	"depth-exceeded": "INGEST_MAX_NESTING_DEPTH",
	"count-exceeded": "INGEST_MAX_NODE_COUNT",
	"text-size-exceeded": "INGEST_MAX_TEXT_SIZE",
	"image-count-exceeded": "INGEST_MAX_IMAGE_COUNT",
};

const LIMIT_BY_REASON: Partial<Record<IngestDropReason, number>> = {
	"depth-exceeded": INGEST_MAX_NESTING_DEPTH,
	"count-exceeded": INGEST_MAX_NODE_COUNT,
	"text-size-exceeded": INGEST_MAX_TEXT_SIZE,
	"image-count-exceeded": INGEST_MAX_IMAGE_COUNT,
};

export interface IngestDroppedByReason {
	readonly reason: IngestDropReason;
	readonly count: number;
	readonly bound?: string;
	readonly limit?: number;
	readonly actual?: number;
	readonly dropped: string;
}

export interface IngestReport extends ImportResult {
	readonly droppedByReason: readonly IngestDroppedByReason[];
}

export class IngestDropCounts {
	private readonly counts = new Map<IngestDropReason, number>();
	private readonly actuals = new Map<IngestDropReason, number>();

	add(reason: IngestDropReason, count = 1, actual?: number): void {
		this.counts.set(reason, (this.counts.get(reason) ?? 0) + count);
		if (actual !== undefined) {
			this.actuals.set(reason, Math.max(this.actuals.get(reason) ?? 0, actual));
		}
	}

	toDroppedByReason(): IngestDroppedByReason[] {
		const reasons = [...this.counts.entries()].sort(([a], [b]) =>
			a.localeCompare(b, "en"),
		);
		return reasons.map(([reason, count]) => {
			const bound = BOUND_BY_REASON[reason];
			const limit = LIMIT_BY_REASON[reason];
			const actual = resolveActual(reason, count, this.actuals.get(reason));
			const entry: IngestDroppedByReason = {
				reason,
				count,
				dropped: formatDropped(reason, count),
			};
			if (bound && limit !== undefined && actual !== undefined) {
				return { ...entry, bound, limit, actual };
			}
			return bound ? { ...entry, bound } : entry;
		});
	}
}

/**
 * Refuse a JSON source that exceeds the text cap. Slicing would produce
 * invalid JSON, so parse never runs on the oversize string.
 */
export function capRawJsonSource(
	input: string,
	drops: IngestDropCounts,
): string | null {
	if (input.length <= INGEST_MAX_TEXT_SIZE) {
		return input;
	}
	drops.add(
		"text-size-exceeded",
		input.length - INGEST_MAX_TEXT_SIZE,
		input.length,
	);
	return null;
}

export function parseJsonSource(source: string): unknown {
	if (source.length > INGEST_MAX_TEXT_SIZE) {
		throw new Error(
			`JSON parse received ${source.length} code units; INGEST_MAX_TEXT_SIZE is ${INGEST_MAX_TEXT_SIZE}`,
		);
	}
	return JSON.parse(source);
}

export function createIngestReport(
	parsedTopLevelBlockCount: number,
	importedTopLevelBlockCount: number,
	droppedBlockTypes: readonly string[],
	drops: IngestDropCounts,
): IngestReport {
	const droppedByReason = drops.toDroppedByReason();
	return {
		parsedTopLevelBlockCount,
		importedTopLevelBlockCount,
		droppedBlockCount: Math.max(
			0,
			parsedTopLevelBlockCount - importedTopLevelBlockCount,
		),
		droppedBlockTypes: [...droppedBlockTypes],
		normalized: droppedByReason.length > 0,
		droppedByReason,
	};
}

export function emitIngestReport(
	editor: Pick<Editor, "internals">,
	report: IngestReport,
	source: string,
): void {
	if (report.droppedByReason.length === 0) {
		return;
	}

	const truncated = report.droppedByReason.some((entry) => entry.bound);
	editor.internals.emit("diagnostic", {
		code: truncated ? "import-truncated" : "import-dropped",
		level: "warn",
		source,
		message: formatIngestMessage(report, truncated),
		droppedByReason: report.droppedByReason,
	});
}

function isForbiddenKey(key: string): boolean {
	return (
		key === "__proto__" || key === "constructor" || key === "prototype"
	);
}

export function emptyRecord(): Record<string, unknown> {
	return Object.create(null) as Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fresh null-prototype copy. Never deep-merges raw parsed JSON into an
 * existing object. `__proto__` / `constructor` / `prototype` own keys are
 * rejected anywhere in the tree (SEC4).
 */
function copyJsonValue(
	value: unknown,
	drops: IngestDropCounts,
): unknown {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => copyJsonValue(item, drops));
	}
	return copyRecord(value, drops);
}

export function copyRecord(
	source: object,
	drops: IngestDropCounts,
): Record<string, unknown> {
	const record = emptyRecord();
	for (const key of INGEST_FORBIDDEN_KEYS) {
		if (Object.prototype.hasOwnProperty.call(source, key)) {
			drops.add("forbidden-key");
		}
	}
	for (const key of Object.keys(source)) {
		if (isForbiddenKey(key)) {
			continue;
		}
		record[key] = copyJsonValue(
			(source as Record<string, unknown>)[key],
			drops,
		);
	}
	return record;
}

function resolveActual(
	reason: IngestDropReason,
	count: number,
	stored: number | undefined,
): number | undefined {
	if (stored !== undefined) {
		return stored;
	}
	if (reason === "count-exceeded") {
		return INGEST_MAX_NODE_COUNT + count;
	}
	if (reason === "image-count-exceeded") {
		return INGEST_MAX_IMAGE_COUNT + count;
	}
	return undefined;
}

function formatIngestMessage(report: IngestReport, truncated: boolean): string {
	const parts = report.droppedByReason.map((entry) => {
		const bound = entry.bound ? ` (${entry.bound})` : "";
		return `${entry.dropped} ${entry.reason}${bound}`;
	});
	const verb = truncated ? "truncated" : "dropped";
	return `import ${verb}: ${parts.join("; ")}`;
}

function formatDropped(reason: IngestDropReason, count: number): string {
	switch (reason) {
		case "text-size-exceeded":
			return `${count} code unit${count === 1 ? "" : "s"}`;
		case "image-count-exceeded":
			return `${count} image${count === 1 ? "" : "s"}`;
		case "forbidden-key":
			return `${count} own key${count === 1 ? "" : "s"}`;
		case "invalid-props":
			return `${count} prop${count === 1 ? "" : "s"}`;
		case "unknown-block-type":
		case "profile-disallowed":
		case "depth-exceeded":
		case "count-exceeded":
			return `${count} block${count === 1 ? "" : "s"}`;
		default: {
			const exhaustive: never = reason;
			return exhaustive;
		}
	}
}
