import type { ImportResult, Editor } from "@input/pen-types";

/**
 * Ingest envelope (IOP5 / SEC4). Same numbers on every ingest path — not
 * per-format values. Documented here and in the package README alongside
 * `spec-v2/22-scale-envelope.md` SCALE1 (verified document size) so a host
 * can tell paste/import caps from the published runtime envelope.
 *
 * SEC4: depth 32, 10k nodes. IOP5 adds total text size and image count.
 * Exceeding a cap truncates at a block boundary (`import-truncated`).
 */

/** Maximum block-tree depth, including the top-level block. */
export const INGEST_MAX_NESTING_DEPTH = 32;

/** Maximum nodes (blocks, including table rows/cells) accepted in one ingest. */
export const INGEST_MAX_NODE_COUNT = 10_000;

/** Maximum imported plain text, in UTF-16 code units. */
export const INGEST_MAX_TEXT_SIZE = 1_048_576;

/** Maximum image blocks accepted in one ingest. */
export const INGEST_MAX_IMAGE_COUNT = 256;

export const INGEST_FORBIDDEN_KEYS = [
	"__proto__",
	"constructor",
	"prototype",
] as const;

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

export interface IngestDroppedByReason {
	readonly reason: IngestDropReason;
	readonly count: number;
	readonly bound?: string;
	readonly dropped: string;
}

export interface IngestReport extends ImportResult {
	readonly droppedByReason: readonly IngestDroppedByReason[];
}

export class IngestDropCounts {
	private readonly counts = new Map<IngestDropReason, number>();

	add(reason: IngestDropReason, count = 1): void {
		this.counts.set(reason, (this.counts.get(reason) ?? 0) + count);
	}

	toDroppedByReason(): IngestDroppedByReason[] {
		const reasons = [...this.counts.entries()].sort(([a], [b]) =>
			a.localeCompare(b),
		);
		return reasons.map(([reason, count]) => {
			const bound = BOUND_BY_REASON[reason];
			const entry: IngestDroppedByReason = {
				reason,
				count,
				dropped: formatDropped(reason, count),
			};
			return bound ? { ...entry, bound } : entry;
		});
	}
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

export function isForbiddenKey(key: string): boolean {
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
export function copyJsonValue(
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
		if (Object.hasOwn(source, key)) {
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
