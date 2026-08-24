export type Pg1VersusKind = "count" | "bytes" | "us" | "ms";

export interface Pg1VersusEntry {
	readonly budget: number;
	readonly measured: number;
	readonly blown: boolean;
	readonly enforced: boolean;
	readonly unit: Pg1VersusKind;
}

export interface Pg1EncodeSizes {
	readonly count: number;
	readonly minBytes: number;
	readonly p50Bytes: number;
	readonly p95Bytes: number;
	readonly maxBytes: number;
}

export interface Pg1ResolveCounts {
	readonly resolveCount: number;
	readonly nullCount: number;
}

export interface Pg1Timings {
	readonly measurable: boolean;
	readonly reason: string;
	readonly loadavg1: number;
	readonly cpuCount: number;
	readonly mintUsPerCall: number | null;
	readonly resolveUsPerCall: number | null;
	readonly resolve200UsPerCall: number | null;
	readonly floorUsPerCall: number | null;
}

export interface Pg1Counts {
	readonly encodeSize: Pg1EncodeSizes;
	readonly encodeSizeCell: Pg1EncodeSizes;
	readonly resolve70k: Pg1ResolveCounts & { readonly charCount: number };
	readonly resolve200Blocks: Pg1ResolveCounts & {
		readonly blockCount: number;
	};
	readonly resolveCell70k: Pg1ResolveCounts & {
		readonly charCount: number;
		readonly wrongTypeCount: number;
	};
	readonly resolve200Cells: Pg1ResolveCounts & {
		readonly cellCount: number;
		readonly wrongTypeCount: number;
	};
	readonly splitFollow: {
		readonly stuckCount: number;
		readonly followedCount: number;
		readonly v2MismatchCount: number;
	};
	readonly cellInBlockEdit: {
		readonly insertOnCell: number;
		readonly deleteOnCell: number;
		readonly tableHasContent: number;
	};
}

export interface Pg1AnchorBudgetRecord {
	readonly schemaVersion: number;
	readonly ruleId: "PG1";
	readonly spec: string;
	readonly recordedAt: string;
	readonly caveat: string;
	readonly fixture: {
		readonly id: string;
		readonly generator: string;
		readonly seed: number;
		readonly seedHex: string;
		readonly wordCount: number;
		readonly paragraphCount: number;
		readonly cellCount: number;
		readonly cellWordCount: number;
		readonly paragraphSha256: string;
		readonly contentSha256: string;
		readonly substrate: {
			readonly word: string;
			readonly wordRepeat: number;
			readonly charCount: number;
			readonly encodeCount: number;
			readonly blockCount: number;
			readonly cellCount: number;
			readonly clientID: number;
		};
	};
	readonly environment: {
		readonly producedOn: string;
		readonly platform: string;
		readonly arch: string;
		readonly node: string;
		readonly cpuCount: number;
		readonly loadavg1: number;
		readonly loadTaken: boolean;
		readonly browser: "none" | "chromium";
		readonly browserVersion: string | null;
		readonly machineClass: string;
	};
	readonly protocol: {
		readonly wiring: string;
		readonly clientID: number;
		readonly clientIDNote: string;
		readonly liveCountNote: string;
		readonly clockPolicy: string;
	};
	readonly counts: Pg1Counts;
	readonly timings: Pg1Timings;
	readonly versusSpec: Record<string, Pg1VersusEntry>;
}

export interface Pg1Failure {
	readonly name: string;
	readonly actual: number | string;
	readonly expected: number | string;
	readonly message: string;
}

export interface Pg1CompareResult {
	readonly ok: boolean;
	readonly population: number;
	readonly failures: readonly Pg1Failure[];
}
