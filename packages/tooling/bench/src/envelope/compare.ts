import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchResult } from "../bench";
import {
	ENVELOPE_DRIFT_FLOOR_MS,
	ENVELOPE_DRIFT_RATIO,
	ENVELOPE_GATE_MIN_SIGNAL_MS,
	ENVELOPE_SAMPLE_SIZE,
	SCALE1_MACHINE_CLASS,
	SCALE1_MEASUREMENTS,
	envelopeGateP50Ms,
	envelopePointIsGated,
	type EnvelopeAxis,
	type EnvelopeRungId,
} from "../constants/scale1";
import { getScale1FixtureAudit } from "../fixtures/audit";
import {
	scale1EnvelopeBenchId,
	scale1EnvelopeFloorId,
} from "../suites/scale1.bench";
import { sameEnvelopeGateClass } from "./machine";

export type EnvelopeFloorKind = "empty-timer" | "empty-sync";
export type EnvelopeStatus = "envelope" | "provisional";

export interface EnvelopePointRecord {
	id: EnvelopeRungId;
	axis: EnvelopeAxis;
	metadataRungId: string | null;
	size: string;
	operation: string;
	measuredP50Ms: number;
	floorP50Ms: number;
	floorKind: EnvelopeFloorKind;
	attributedP50Ms: number;
	p95Ms: number;
	maxMs: number;
	p95Ratio: number;
	gated: boolean;
	gateP50Ms: number | null;
}

export interface EnvelopeRecord {
	ruleId: "SCALE1";
	spec: string;
	gateStatistic: "median";
	sampleSize: number;
	machineClass: string;
	producedOn: string;
	floorProducedOn: string;
	status: EnvelopeStatus;
	caveat: string;
	tolerance: {
		ratio: number;
		floorMs: number;
		minSignalMs: number;
		formula: string;
		justification: string;
		crossClass: string;
	};
	points: EnvelopePointRecord[];
}

export interface EnvelopeDriftFailure {
	id: string;
	reason: "missing" | "missing-floor" | "timing";
	measuredP50Ms: number;
	attributedP50Ms: number;
	committedP50Ms: number;
	gateP50Ms: number;
}

export interface EnvelopeDriftResult {
	ok: boolean;
	skippedTiming: boolean;
	skipReason: string | null;
	failures: EnvelopeDriftFailure[];
}

export const ENVELOPE_TOLERANCE_JUSTIFICATION =
	"Same-run p95/p50 on the committed macos-arm64 sample (n=21) peaked at 2.38× (100-block). The same-class gate is 3× attributed median for rungs whose attributed p50 is at least 0.5ms. Below that the clock is inside timer noise and a ratio cannot be attributed to Pen. The +1ms term applies only above that signal. P95 and Max are trend-only (CH8).";

export const ENVELOPE_CROSS_CLASS_POLICY =
	"Timing is not compared across machine classes. macos-arm64 medians are not a ubuntu-latest budget; a ratio picked to absorb that gap cannot catch a regression.";

export function envelopeBaselinePath(): string {
	return resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../../baselines/envelope.json",
	);
}

export function envelopeTablePath(): string {
	return resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../../ENVELOPE.md",
	);
}

export interface BuildEnvelopeRecordOptions {
	floorResults: readonly BenchResult[];
	producedOn?: string;
	floorProducedOn?: string;
	machineClass?: string;
	status?: EnvelopeStatus;
	caveat?: string;
}

export function buildEnvelopeRecord(
	results: readonly BenchResult[],
	options: BuildEnvelopeRecordOptions,
): EnvelopeRecord {
	const producedOn =
		options.producedOn ?? new Date().toISOString().slice(0, 10);
	const floorProducedOn = options.floorProducedOn ?? producedOn;
	const points = SCALE1_MEASUREMENTS.map((spec) => {
		const result = results.find(
			(entry) => entry.id === scale1EnvelopeBenchId(spec.id),
		);
		if (!result) {
			throw new Error(`SCALE1 result missing for ${spec.id}`);
		}
		const floor = options.floorResults.find(
			(entry) => entry.id === scale1EnvelopeFloorId(spec.id),
		);
		if (!floor) {
			throw new Error(`SCALE1 harness floor missing for ${spec.id}`);
		}
		const measuredP50Ms = roundMs(result.p50Ms);
		const floorP50Ms = roundMs(floor.p50Ms);
		const attributedP50Ms = roundMs(
			Math.max(0, measuredP50Ms - floorP50Ms),
		);
		const gated = envelopePointIsGated(attributedP50Ms);
		const audit = getScale1FixtureAudit(spec.id);
		if (
			audit.floorKind !== "empty-timer" &&
			audit.floorKind !== "empty-sync"
		) {
			throw new Error(
				`SCALE1 floor kind is not measurable for ${spec.id}`,
			);
		}
		return {
			id: spec.id,
			axis: spec.axis,
			metadataRungId: spec.metadataRungId,
			size: spec.size,
			operation: operationFor(spec.id),
			measuredP50Ms,
			floorP50Ms,
			floorKind: audit.floorKind,
			attributedP50Ms,
			p95Ms: roundMs(result.p95Ms),
			maxMs: roundMs(result.maxMs),
			p95Ratio:
				measuredP50Ms === 0 ? 0 : roundMs(result.p95Ms / result.p50Ms),
			gated,
			gateP50Ms: gated
				? roundMs(envelopeGateP50Ms(attributedP50Ms))
				: null,
		};
	});

	return {
		ruleId: "SCALE1",
		spec: "spec-v2/22-scale-envelope.md",
		gateStatistic: "median",
		sampleSize: ENVELOPE_SAMPLE_SIZE,
		machineClass: options.machineClass ?? SCALE1_MACHINE_CLASS,
		producedOn,
		floorProducedOn,
		status: options.status ?? "envelope",
		caveat: options.caveat ?? "",
		tolerance: {
			ratio: ENVELOPE_DRIFT_RATIO,
			floorMs: ENVELOPE_DRIFT_FLOOR_MS,
			minSignalMs: ENVELOPE_GATE_MIN_SIGNAL_MS,
			formula:
				"gated when attributedP50Ms >= 0.5; gateP50Ms = max(attributedP50Ms * 3, attributedP50Ms + 1)",
			justification: ENVELOPE_TOLERANCE_JUSTIFICATION,
			crossClass: ENVELOPE_CROSS_CLASS_POLICY,
		},
		points,
	};
}

export function compareEnvelopeDrift(
	fresh: EnvelopeRecord,
	committed: EnvelopeRecord,
): EnvelopeDriftResult {
	const failures: EnvelopeDriftFailure[] = [];
	const sameClass = sameEnvelopeGateClass(
		fresh.machineClass,
		committed.machineClass,
	);
	const skippedTiming = !sameClass;
	const skipReason = skippedTiming
		? `machine class ${fresh.machineClass} ≠ ${committed.machineClass}; ${ENVELOPE_CROSS_CLASS_POLICY}`
		: null;

	for (const point of fresh.points) {
		const baseline = committed.points.find(
			(entry) => entry.id === point.id,
		);
		if (!baseline) {
			failures.push({
				id: point.id,
				reason: "missing",
				measuredP50Ms: point.measuredP50Ms,
				attributedP50Ms: point.attributedP50Ms,
				committedP50Ms: Number.NaN,
				gateP50Ms: point.gateP50Ms ?? Number.NaN,
			});
			continue;
		}
		if (!hasMeasuredFloor(point) || !hasMeasuredFloor(baseline)) {
			failures.push({
				id: point.id,
				reason: "missing-floor",
				measuredP50Ms: point.measuredP50Ms,
				attributedP50Ms: point.attributedP50Ms,
				committedP50Ms: baseline.measuredP50Ms,
				gateP50Ms: baseline.gateP50Ms ?? Number.NaN,
			});
			continue;
		}
		if (skippedTiming || !baseline.gated || baseline.gateP50Ms == null) {
			continue;
		}
		if (point.attributedP50Ms > baseline.gateP50Ms) {
			failures.push({
				id: point.id,
				reason: "timing",
				measuredP50Ms: point.measuredP50Ms,
				attributedP50Ms: point.attributedP50Ms,
				committedP50Ms: baseline.attributedP50Ms,
				gateP50Ms: baseline.gateP50Ms,
			});
		}
	}

	return { ok: failures.length === 0, skippedTiming, skipReason, failures };
}

export function formatEnvelopeDrift(result: EnvelopeDriftResult): string {
	if (result.ok) {
		if (result.skippedTiming && result.skipReason) {
			return `SCALE1 envelope drift: structure ok; timing not compared (${result.skipReason})`;
		}
		return "SCALE1 envelope drift: within tolerance";
	}
	const detail = result.failures
		.map((failure) => {
			if (failure.reason === "missing") {
				return `${failure.id} missing from committed envelope`;
			}
			if (failure.reason === "missing-floor") {
				return `${failure.id} has no harness floor`;
			}
			return `${failure.id} attributed ${failure.attributedP50Ms.toFixed(2)}ms > gate ${failure.gateP50Ms.toFixed(2)}ms (committed ${failure.committedP50Ms.toFixed(2)}ms)`;
		})
		.join("; ");
	return `SCALE1 envelope drift exceeded tolerance: ${detail}`;
}

export async function loadCommittedEnvelope(
	path = envelopeBaselinePath(),
): Promise<EnvelopeRecord> {
	const raw = await readFile(path, "utf8");
	const parsed = JSON.parse(raw) as EnvelopeRecord;
	assertEnvelopeRecord(parsed);
	return parsed;
}

export async function writeEnvelopeRecord(
	record: EnvelopeRecord,
	path = envelopeBaselinePath(),
): Promise<void> {
	await writeFile(path, `${JSON.stringify(record, null, "\t")}\n`, "utf8");
}

function hasMeasuredFloor(point: EnvelopePointRecord): boolean {
	return (
		typeof point.floorP50Ms === "number" &&
		Number.isFinite(point.floorP50Ms) &&
		typeof point.attributedP50Ms === "number" &&
		Number.isFinite(point.attributedP50Ms)
	);
}

function assertEnvelopeRecord(value: EnvelopeRecord): void {
	if (value.ruleId !== "SCALE1" || !Array.isArray(value.points)) {
		throw new Error("SCALE1 envelope baseline is not a SCALE1 record");
	}
	for (const point of value.points) {
		if (!hasMeasuredFloor(point)) {
			throw new Error(
				`SCALE1 envelope baseline ${point.id} has no harness floor; a wall-clock without a floor is not a measurement`,
			);
		}
	}
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
