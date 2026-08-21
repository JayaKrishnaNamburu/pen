import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchResult } from "../bench";
import {
	ENVELOPE_DRIFT_FLOOR_MS,
	ENVELOPE_DRIFT_RATIO,
	ENVELOPE_SAMPLE_SIZE,
	SCALE1_MACHINE_CLASS,
	SCALE1_MEASUREMENTS,
	envelopeGateP50Ms,
	type EnvelopeAxis,
	type EnvelopeRungId,
} from "../constants/scale1";

export interface EnvelopePointRecord {
	id: EnvelopeRungId;
	axis: EnvelopeAxis;
	metadataRungId: string | null;
	size: string;
	operation: string;
	measuredP50Ms: number;
	p95Ms: number;
	maxMs: number;
	gateP50Ms: number;
}

export interface EnvelopeRecord {
	ruleId: "SCALE1";
	spec: string;
	gateStatistic: "median";
	sampleSize: number;
	machineClass: string;
	producedOn: string;
	tolerance: {
		ratio: number;
		floorMs: number;
		formula: string;
		justification: string;
	};
	points: EnvelopePointRecord[];
}

export interface EnvelopeDriftFailure {
	id: string;
	measuredP50Ms: number;
	committedP50Ms: number;
	gateP50Ms: number;
}

export interface EnvelopeDriftResult {
	ok: boolean;
	failures: EnvelopeDriftFailure[];
}

const ENVELOPE_TOLERANCE_JUSTIFICATION =
	"Local medians are macos-arm64. CI is github-actions-ubuntu-latest and is slower and noisier. 4× the measured median covers that class gap. The 15ms floor covers sub-millisecond rungs, where a pure ratio would treat runner jitter as a regression. The gate is the median of ENVELOPE_SAMPLE_SIZE; P95 and Max are trend-only (CH8).";

export function envelopeBaselinePath(): string {
	return resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../../baselines/envelope.json",
	);
}

export function buildEnvelopeRecord(
	results: readonly BenchResult[],
	producedOn = new Date().toISOString().slice(0, 10),
): EnvelopeRecord {
	const points = SCALE1_MEASUREMENTS.map((spec) => {
		const result = results.find(
			(entry) => entry.id === `scale1.envelope.${spec.id}`,
		);
		if (!result) {
			throw new Error(`SCALE1 result missing for ${spec.id}`);
		}
		const measuredP50Ms = roundMs(result.p50Ms);
		return {
			id: spec.id,
			axis: spec.axis,
			metadataRungId: spec.metadataRungId,
			size: spec.size,
			operation: operationFor(spec.id),
			measuredP50Ms,
			p95Ms: roundMs(result.p95Ms),
			maxMs: roundMs(result.maxMs),
			gateP50Ms: roundMs(envelopeGateP50Ms(measuredP50Ms)),
		};
	});

	return {
		ruleId: "SCALE1",
		spec: "spec-v2/22-scale-envelope.md",
		gateStatistic: "median",
		sampleSize: ENVELOPE_SAMPLE_SIZE,
		machineClass: SCALE1_MACHINE_CLASS,
		producedOn,
		tolerance: {
			ratio: ENVELOPE_DRIFT_RATIO,
			floorMs: ENVELOPE_DRIFT_FLOOR_MS,
			formula: "gateP50Ms = max(measuredP50Ms * 4, measuredP50Ms + 15)",
			justification: ENVELOPE_TOLERANCE_JUSTIFICATION,
		},
		points,
	};
}

export function compareEnvelopeDrift(
	fresh: EnvelopeRecord,
	committed: EnvelopeRecord,
): EnvelopeDriftResult {
	const failures: EnvelopeDriftFailure[] = [];

	for (const point of fresh.points) {
		const baseline = committed.points.find((entry) => entry.id === point.id);
		if (!baseline) {
			failures.push({
				id: point.id,
				measuredP50Ms: point.measuredP50Ms,
				committedP50Ms: Number.NaN,
				gateP50Ms: point.gateP50Ms,
			});
			continue;
		}
		if (point.measuredP50Ms > baseline.gateP50Ms) {
			failures.push({
				id: point.id,
				measuredP50Ms: point.measuredP50Ms,
				committedP50Ms: baseline.measuredP50Ms,
				gateP50Ms: baseline.gateP50Ms,
			});
		}
	}

	return { ok: failures.length === 0, failures };
}

export function formatEnvelopeDrift(result: EnvelopeDriftResult): string {
	if (result.ok) {
		return "SCALE1 envelope drift: within tolerance";
	}
	const detail = result.failures
		.map(
			(failure) =>
				`${failure.id} median ${failure.measuredP50Ms.toFixed(2)}ms > gate ${failure.gateP50Ms.toFixed(2)}ms (committed ${Number.isNaN(failure.committedP50Ms) ? "missing" : `${failure.committedP50Ms.toFixed(2)}ms`})`,
		)
		.join("; ");
	return `SCALE1 envelope drift exceeded tolerance: ${detail}`;
}

export async function loadCommittedEnvelope(
	path = envelopeBaselinePath(),
): Promise<EnvelopeRecord> {
	const raw = await readFile(path, "utf8");
	return JSON.parse(raw) as EnvelopeRecord;
}

export async function writeEnvelopeRecord(
	record: EnvelopeRecord,
	path = envelopeBaselinePath(),
): Promise<void> {
	await writeFile(path, `${JSON.stringify(record, null, "\t")}\n`, "utf8");
}

function operationFor(id: EnvelopeRungId): string {
	switch (id) {
		case "table-50x20":
			return "insert-table-cell-text";
		case "concurrentPeers-2":
			return "insert-text + sync";
		case "blocks-100":
		case "blocks-1000":
		case "blocks-5000":
		case "long-block":
		case "nesting-10":
			return "insert-text";
		default: {
			const exhaustive: never = id;
			throw new Error(`Unknown envelope rung: ${exhaustive}`);
		}
	}
}

function roundMs(value: number): number {
	return Math.round(value * 100) / 100;
}
