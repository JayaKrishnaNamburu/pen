import { writeFile } from "node:fs/promises";
import { ENVELOPE_SAMPLE_SIZE } from "../constants/scale1";
import { reportConsole } from "../reporters/console";
import { reportJSON } from "../reporters/json";
import { runSuite } from "../bench";
import {
	scale1Benchmarks,
	scale1FloorBenchmarks,
} from "../suites/scale1.bench";
import {
	buildEnvelopeRecord,
	compareEnvelopeDrift,
	envelopeTablePath,
	formatEnvelopeDrift,
	loadCommittedEnvelope,
	writeEnvelopeRecord,
} from "./compare";
import { detectLoadSnapshot, detectMachineClass } from "./machine";
import { renderEnvelopeMarkdown } from "./table";

export interface RunEnvelopeSuiteOptions {
	iterations?: number;
	warmup?: number;
	reporter?: "console" | "json";
	reportResults?: boolean;
	writeEnvelope?: boolean;
}

export async function runEnvelopeSuite(
	options: RunEnvelopeSuiteOptions = {},
): Promise<void> {
	const reporter = options.reporter ?? "console";
	const iterations = options.iterations ?? ENVELOPE_SAMPLE_SIZE;
	const warmup = options.warmup ?? 3;
	const load = detectLoadSnapshot();
	const machineClass = detectMachineClass();

	const results = await runSuite("SCALE1", scale1Benchmarks, {
		iterations,
		warmup,
		reporter,
	});
	const floorResults = await runSuite("SCALE1-floor", scale1FloorBenchmarks, {
		iterations,
		warmup,
		reporter,
	});

	if (options.reportResults && reporter === "console") {
		reportConsole("SCALE1", results);
		reportConsole("SCALE1-floor", floorResults);
	}
	if (options.reportResults && reporter === "json") {
		console.log(reportJSON("SCALE1", results));
		console.log(reportJSON("SCALE1-floor", floorResults));
	}

	const status = load.busy ? "provisional" : "envelope";
	const caveat = load.busy
		? `Recorded at load ${load.load1.toFixed(2)} on ${load.ncpu} CPUs. Other work was running; these numbers are not a quiet-machine envelope.`
		: `Recorded at load ${load.load1.toFixed(2)} on ${load.ncpu} CPUs.`;

	const fresh = buildEnvelopeRecord(results, {
		floorResults,
		machineClass,
		status,
		caveat,
	});

	if (options.writeEnvelope) {
		await writeEnvelopeRecord(fresh);
		await writeFile(
			envelopeTablePath(),
			renderEnvelopeMarkdown(fresh),
			"utf8",
		);
		if (options.reportResults) {
			console.error(
				`Wrote SCALE1 envelope (${fresh.status}) to baselines/envelope.json and ENVELOPE.md (${fresh.machineClass})`,
			);
		}
		return;
	}

	const committed = await loadCommittedEnvelope();
	const drift = compareEnvelopeDrift(fresh, committed);
	if (!drift.ok) {
		throw new Error(formatEnvelopeDrift(drift));
	}
	if (options.reportResults) {
		console.error(formatEnvelopeDrift(drift));
	}
}
