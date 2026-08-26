import { access } from "node:fs/promises";
import {
	comparePg1Records,
	formatPg1Compare,
	loadPg1Record,
	pg1BaselinePath,
	writePg1Record,
} from "./compare";
import { PG1_MISSING } from "./constants";
import { measurePg1Record } from "./measure";

export function parsePg1Args(args: readonly string[]): {
	compare: boolean;
	write: boolean;
	freshPath?: string;
} {
	let compare = false;
	let write = false;
	let freshPath: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--compare") {
			compare = true;
			continue;
		}
		if (arg === "--write") {
			write = true;
			continue;
		}
		if (arg === "--fresh") {
			const value = args[i + 1];
			if (!value) {
				throw new Error("PG1: missing value for --fresh");
			}
			freshPath = value;
			i += 1;
			continue;
		}
		if (arg?.startsWith("--fresh=")) {
			const value = arg.slice("--fresh=".length);
			if (!value) {
				throw new Error("PG1: missing value for --fresh");
			}
			freshPath = value;
		}
	}
	return { compare, write, ...(freshPath ? { freshPath } : {}) };
}

export async function runPg1Cli(
	args: readonly string[] = process.argv.slice(2),
): Promise<number> {
	let parsed: ReturnType<typeof parsePg1Args>;
	try {
		parsed = parsePg1Args(args);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}

	if (parsed.write) {
		const record = measurePg1Record();
		await writePg1Record(record);
		console.log(
			`PG1 wrote ${pg1BaselinePath()} (loadavg1 ${record.timings.loadavg1.toFixed(2)}, measurable ${record.timings.measurable})`,
		);
		return 0;
	}

	if (!parsed.compare) {
		console.error("PG1: pass --compare or --write");
		return 1;
	}

	const committedPath = pg1BaselinePath();
	try {
		await access(committedPath);
	} catch {
		console.error(`${PG1_MISSING}: ${committedPath}`);
		return 1;
	}

	let committed: Awaited<ReturnType<typeof loadPg1Record>>;
	try {
		committed = await loadPg1Record(committedPath);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	}

	if (parsed.freshPath) {
		try {
			await access(parsed.freshPath);
		} catch {
			console.error(`${PG1_MISSING}: ${parsed.freshPath}`);
			return 1;
		}
		let fresh: Awaited<ReturnType<typeof loadPg1Record>>;
		try {
			fresh = await loadPg1Record(parsed.freshPath);
		} catch (error) {
			console.error(
				error instanceof Error ? error.message : String(error),
			);
			return 1;
		}
		const compared = comparePg1Records(fresh, committed);
		const report = formatPg1Compare(compared);
		if (compared.ok) {
			console.log(report);
			return 0;
		}
		console.error(report);
		return 1;
	}

	const live = measurePg1Record();
	const compared = comparePg1Records(live, committed);
	const report = formatPg1Compare(compared);
	if (compared.ok) {
		console.log(report);
		return 0;
	}
	console.error(report);
	return 1;
}
