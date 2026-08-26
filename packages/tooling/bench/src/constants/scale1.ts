/**
 * SCALE1 (`spec/rules/scale.md`): measurement points for the
 * published envelope axes. The generated table is
 * `packages/tooling/bench/ENVELOPE.md`, rendered from
 * `baselines/envelope.json` plus the fixture audit.
 *
 * Machine class that produced the committed wall-clock medians:
 *   macos-arm64 (darwin 25, Apple Silicon, local isolated `tsx` run)
 * CI machine class:
 *   github-actions-ubuntu-latest (`.github/workflows/bench.yml`)
 *
 * Wall-clock numbers in `baselines/envelope.json` are from the local
 * class. They are not CI measurements. A row without a harness floor
 * is not attributed to Pen.
 */

export const SCALE1_MACHINE_CLASS =
	"macos-arm64 (darwin 25, Apple Silicon). Not the CI runner (github-actions-ubuntu-latest).";

/** CH8: envelope gates use the median of this many measured iterations. */
export const ENVELOPE_SAMPLE_SIZE = 21;

/**
 * Same-class timing gate, derived from the committed macos-arm64
 * sample (n=21): same-run p95/p50 peaked at 2.38× (100-block). 3×
 * attributed median covers that spread. Rungs whose attributed p50 is
 * below ENVELOPE_GATE_MIN_SIGNAL_MS are recorded, not gated — a ratio
 * on 0.03ms is timer noise. The +1ms term applies only above that
 * signal so it cannot manufacture a 30× allowance on a sub-ms rung.
 *
 * Cross-class (macos-arm64 vs ubuntu-latest) is not gated. The previous
 * 4× + 15ms formula existed to absorb that gap and could not catch a
 * regression on the 100-block rung (gate 15.21ms on a 0.21ms median).
 */
export const ENVELOPE_DRIFT_RATIO = 3;
export const ENVELOPE_DRIFT_FLOOR_MS = 1;
export const ENVELOPE_GATE_MIN_SIGNAL_MS = 0.5;

export type EnvelopeAxis =
	| "blockCount"
	| "longestBlock"
	| "nestingDepth"
	| "table"
	| "concurrentPeers";

export type EnvelopeRungId =
	| "blocks-100"
	| "blocks-1000"
	| "blocks-5000"
	| "long-block"
	| "nesting-10"
	| "table-50x20"
	| "concurrentPeers-2";

export interface EnvelopeMeasurementSpec {
	id: EnvelopeRungId;
	axis: EnvelopeAxis;
	/** Rung id in the published metadata, when this point is a document rung. */
	metadataRungId: string | null;
	size: string;
	unit: string;
	point: number;
}

/** Same sizes as `metadata.json` `ladder` / `rungs` / `axes`. */
export const SCALE1_BLOCK_COUNTS = [100, 1000, 5000] as const;
export const SCALE1_LONG_BLOCK_CHARS = 100_000;
export const SCALE1_NESTING_DEPTH = 10;
export const SCALE1_TABLE_ROWS = 50;
export const SCALE1_TABLE_COLS = 20;
export const SCALE1_PEER_COUNT = 2;

export const SCALE1_MEASUREMENTS: readonly EnvelopeMeasurementSpec[] = [
	{
		id: "blocks-100",
		axis: "blockCount",
		metadataRungId: "blocks-100",
		size: "100 blocks",
		unit: "blocks",
		point: 100,
	},
	{
		id: "blocks-1000",
		axis: "blockCount",
		metadataRungId: "blocks-1000",
		size: "1,000 blocks",
		unit: "blocks",
		point: 1000,
	},
	{
		id: "blocks-5000",
		axis: "blockCount",
		metadataRungId: "blocks-5000",
		size: "5,000 blocks",
		unit: "blocks",
		point: 5000,
	},
	{
		id: "long-block",
		axis: "longestBlock",
		metadataRungId: "long-block",
		size: "100,000 characters",
		unit: "characters",
		point: SCALE1_LONG_BLOCK_CHARS,
	},
	{
		id: "nesting-10",
		axis: "nestingDepth",
		metadataRungId: "nesting-10",
		size: "depth 10",
		unit: "depth",
		point: SCALE1_NESTING_DEPTH,
	},
	{
		id: "table-50x20",
		axis: "table",
		metadataRungId: "table-50x20",
		size: "50 × 20",
		unit: "cells",
		point: SCALE1_TABLE_ROWS * SCALE1_TABLE_COLS,
	},
	{
		id: "concurrentPeers-2",
		axis: "concurrentPeers",
		metadataRungId: null,
		size: "2 peers",
		unit: "peers",
		point: SCALE1_PEER_COUNT,
	},
];

export function envelopePointIsGated(attributedP50Ms: number): boolean {
	return attributedP50Ms >= ENVELOPE_GATE_MIN_SIGNAL_MS;
}

export function envelopeGateP50Ms(attributedP50Ms: number): number {
	return Math.max(
		attributedP50Ms * ENVELOPE_DRIFT_RATIO,
		attributedP50Ms + ENVELOPE_DRIFT_FLOOR_MS,
	);
}

export function getScale1Measurement(
	id: EnvelopeRungId,
): EnvelopeMeasurementSpec {
	const spec = SCALE1_MEASUREMENTS.find((entry) => entry.id === id);
	if (!spec) {
		throw new Error(`SCALE1 measurement missing for ${id}`);
	}
	return spec;
}

export function assertNeverEnvelopeAxis(axis: never): never {
	throw new Error(`Unknown envelope axis: ${String(axis)}`);
}

export function assertNeverEnvelopeRung(id: never): never {
	throw new Error(`Unknown envelope rung: ${String(id)}`);
}
