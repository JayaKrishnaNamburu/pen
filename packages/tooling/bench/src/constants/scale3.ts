/**
 * SCALE3 (`spec-v2/22-scale-envelope.md`): axes, stack, and committed
 * baselines for the realistic-stack keystroke workload.
 *
 * Machine class that produced the measured medians:
 *   macos-arm64 (darwin 25, Apple Silicon, local isolated `tsx` run)
 * CI machine class the isolated job uses:
 *   github-actions-ubuntu-latest (`.github/workflows/bench.yml`)
 *
 * `measuredP50Ms` is the recorded median. `gateP50Ms` is that number plus
 * slack for the CI class — the CH8 comparison target, not an invented
 * frame budget. Update both in the same PR and say why.
 */

export const SCALE3_MACHINE_CLASS =
	"macos-arm64 (darwin 25, Apple Silicon); CI: github-actions-ubuntu-latest";

/** Current measured envelope for `@input/pen-bench` (SCALE1 ladder 100 / 1_000 / 5_000; F.1 owns 5_000). */
export const SCALE3_DOCUMENT_SIZE_POINTS = [100, 1000] as const;

/**
 * Shipped stack count (4 default-preset + 5 no-op plus-extensions) and the
 * SCALE2 "+8 no-op decorating extensions" point.
 */
export const SCALE3_EXTENSION_COUNT_POINTS = [9, 17] as const;

export const SCALE3_DECORATION_COUNT_POINTS = [0, 256] as const;

/** Matches the 8-remote-caret layout fixture cited in the wave plan. */
export const SCALE3_PEER_COUNT_POINTS = [0, 8] as const;

export const SCALE3_DEFAULT_PRESET_EXTENSIONS = [
	"document-ops",
	"delta-stream",
	"undo",
	"rich-text-shortcuts",
] as const;

/**
 * Stand-ins for the packages hosts add on top of the default preset.
 * They keep the shipped names and the observe/decoration hooks so the
 * commit path pays extension-list cost. They do not import `@input/pen-ai`
 * (or suggestions/autocomplete/search/multiplayer): activating those
 * controllers, model adapters, and analysis caches would measure AI
 * runtime, not the per-keystroke dispatch SCALE3 exists to see.
 */
export const SCALE3_PLUS_EXTENSIONS = [
	"ai",
	"ai-suggestions",
	"ai-autocomplete",
	"search",
	"multiplayer",
] as const;

export const SCALE3_SHIPPED_STACK = [
	...SCALE3_DEFAULT_PRESET_EXTENSIONS,
	...SCALE3_PLUS_EXTENSIONS,
] as const;

export type Scale3Axis =
	| "document-size"
	| "extension-count"
	| "decoration-count"
	| "peer-count";

export interface Scale3AxisSpec {
	axis: Scale3Axis;
	points: readonly [number, number];
	unit: string;
}

export const SCALE3_AXES: readonly Scale3AxisSpec[] = [
	{
		axis: "document-size",
		points: SCALE3_DOCUMENT_SIZE_POINTS,
		unit: "blocks",
	},
	{
		axis: "extension-count",
		points: SCALE3_EXTENSION_COUNT_POINTS,
		unit: "extensions",
	},
	{
		axis: "decoration-count",
		points: SCALE3_DECORATION_COUNT_POINTS,
		unit: "decorations",
	},
	{
		axis: "peer-count",
		points: SCALE3_PEER_COUNT_POINTS,
		unit: "peers",
	},
];

export interface Scale3Baseline {
	id: string;
	axis: Scale3Axis;
	/** The isolated point this bench reports; the other point lives on the paired bench. */
	point: number;
	measuredP50Ms: number;
	gateP50Ms: number;
	machineClass: string;
}

export const SCALE3_BASELINES: readonly Scale3Baseline[] = [
	{
		id: "scale3.keystroke.realistic-stack.document-size.100",
		axis: "document-size",
		point: 100,
		measuredP50Ms: 0.48,
		gateP50Ms: 25,
		machineClass: SCALE3_MACHINE_CLASS,
	},
	{
		id: "scale3.keystroke.realistic-stack.document-size.1000",
		axis: "document-size",
		point: 1000,
		measuredP50Ms: 3.76,
		gateP50Ms: 40,
		machineClass: SCALE3_MACHINE_CLASS,
	},
	{
		id: "scale3.keystroke.realistic-stack.extension-count.plus8",
		axis: "extension-count",
		point: 17,
		measuredP50Ms: 3.64,
		gateP50Ms: 50,
		machineClass: SCALE3_MACHINE_CLASS,
	},
	{
		id: "scale3.keystroke.realistic-stack.decoration-count.256",
		axis: "decoration-count",
		point: 256,
		measuredP50Ms: 3.58,
		gateP50Ms: 50,
		machineClass: SCALE3_MACHINE_CLASS,
	},
	{
		id: "scale3.keystroke.realistic-stack.peer-count.8",
		axis: "peer-count",
		point: 8,
		measuredP50Ms: 3.73,
		gateP50Ms: 50,
		machineClass: SCALE3_MACHINE_CLASS,
	},
];

export function getScale3Baseline(id: string): Scale3Baseline {
	const baseline = SCALE3_BASELINES.find((entry) => entry.id === id);
	if (!baseline) {
		throw new Error(`SCALE3 baseline missing for ${id}`);
	}
	return baseline;
}
