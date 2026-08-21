export function nearestRankPercentile(
	values: readonly number[],
	percentile: number,
): number | null;

export function sampleStats(values: readonly number[]): {
	count: number;
	min: number | null;
	max: number | null;
	mean: number | null;
	p50: number | null;
	p95: number | null;
};

export function signedDelta(
	baseline: number | null | undefined,
	current: number | null | undefined,
): { abs: number | null; pct: number | null };

export function classifyDrift(metric: {
	kind: "count" | "time";
	baseline: number | null;
	current: number | null;
}): "none" | "quiet" | "loud";

export function formatMetricLine(
	name: string,
	kind: "count" | "time",
	baseline: number | null | undefined,
	current: number | null | undefined,
	unit?: string,
): {
	name: string;
	kind: "count" | "time";
	level: "none" | "quiet" | "loud";
	line: string;
};

export type TypingBudgetSummary = {
	readPhaseP95Ms: number | null;
	writePhaseP95Ms: number | null;
	measureNowPerKeystrokeP95: number | null;
	measureNowPerKeystrokeMax: number | null;
	flushesPerFrameMax: number | null;
	flushesPerFrameP95: number | null;
	flushCount: number;
	keystrokeCount: number;
};

export function compareTypingBudgets(
	baseline: { summary: TypingBudgetSummary },
	current: { summary: TypingBudgetSummary },
): {
	lines: ReturnType<typeof formatMetricLine>[];
	loud: ReturnType<typeof formatMetricLine>[];
	quiet: ReturnType<typeof formatMetricLine>[];
};

export function collectBlownSpec(
	versusSpec:
		| Record<
				string,
				{ budget?: unknown; measured?: unknown; blown?: unknown }
		  >
		| undefined,
): {
	name: string;
	measured: unknown;
	budget: unknown;
	line: string;
}[];

export function formatDriftReport(
	baseline: {
		summary: TypingBudgetSummary;
		fixture?: { contentSha256?: string };
		versusSpec?: Record<
			string,
			{ budget?: unknown; measured?: unknown; blown?: unknown }
		>;
	},
	current: {
		summary: TypingBudgetSummary;
		fixture?: { contentSha256?: string };
		versusSpec?: Record<
			string,
			{ budget?: unknown; measured?: unknown; blown?: unknown }
		>;
	},
): {
	text: string;
	loud: boolean;
	specBlown: boolean;
	quietOnly: boolean;
	unchanged: boolean;
	lines: ReturnType<typeof formatMetricLine>[];
};

export function summarizeTypingBudget(args: {
	readPhaseMs: readonly number[];
	writePhaseMs: readonly number[];
	measureNowPerKeystroke: readonly number[];
	flushesPerFrame: readonly number[];
	flushCount: number;
	keystrokeCount: number;
}): TypingBudgetSummary;
