import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	PG1_BASELINE_FILENAME,
	PG1_FIXTURE_HASH,
	PG1_FIXTURE_SEED,
	PG1_MISSING,
	PG1_POPULATION,
	PG1_SCHEMA,
	PG1_SCHEMA_VERSION,
	PG1_SPEC,
	PG1_TEN_K_CONTENT_SHA256,
	PG1_TEN_K_SEED,
} from "./constants";
import type {
	Pg1AnchorBudgetRecord,
	Pg1CompareResult,
	Pg1Failure,
	Pg1VersusEntry,
} from "./types";

export function pg1BaselinePath(): string {
	return resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../../baselines",
		PG1_BASELINE_FILENAME,
	);
}

export function isPg1Record(value: unknown): value is Pg1AnchorBudgetRecord {
	if (value == null || typeof value !== "object") {
		return false;
	}
	const record = value as Partial<Pg1AnchorBudgetRecord>;
	return (
		record.ruleId === "PG1" &&
		record.spec === PG1_SPEC &&
		typeof record.schemaVersion === "number" &&
		record.counts != null &&
		typeof record.counts === "object" &&
		record.versusSpec != null &&
		typeof record.versusSpec === "object"
	);
}

export function comparePg1Records(
	fresh: Pg1AnchorBudgetRecord,
	committed: Pg1AnchorBudgetRecord,
): Pg1CompareResult {
	const failures: Pg1Failure[] = [];
	const push = (
		name: string,
		actual: number | string,
		expected: number | string,
	) => {
		failures.push({
			name,
			actual,
			expected,
			message: `PG1 ${name}: ${actual} !== ${expected}`,
		});
	};

	if (fresh.schemaVersion !== PG1_SCHEMA_VERSION) {
		push(PG1_SCHEMA, fresh.schemaVersion, PG1_SCHEMA_VERSION);
	}
	if (committed.schemaVersion !== PG1_SCHEMA_VERSION) {
		push(PG1_SCHEMA, committed.schemaVersion, PG1_SCHEMA_VERSION);
	}
	if (fresh.fixture.seed !== PG1_TEN_K_SEED) {
		push(PG1_FIXTURE_SEED, fresh.fixture.seed, PG1_TEN_K_SEED);
	}
	if (committed.fixture.seed !== PG1_TEN_K_SEED) {
		push(PG1_FIXTURE_SEED, committed.fixture.seed, PG1_TEN_K_SEED);
	}
	if (fresh.fixture.contentSha256 !== PG1_TEN_K_CONTENT_SHA256) {
		push(
			PG1_FIXTURE_HASH,
			fresh.fixture.contentSha256,
			PG1_TEN_K_CONTENT_SHA256,
		);
	}
	if (committed.fixture.contentSha256 !== PG1_TEN_K_CONTENT_SHA256) {
		push(
			PG1_FIXTURE_HASH,
			committed.fixture.contentSha256,
			PG1_TEN_K_CONTENT_SHA256,
		);
	}

	const freshEnforced = enforcedEntries(fresh.versusSpec);
	const committedEnforced = enforcedEntries(committed.versusSpec);
	if (freshEnforced.length === 0) {
		push(PG1_POPULATION, 0, ">=1 enforced versusSpec rows");
	}
	if (freshEnforced.length !== committedEnforced.length) {
		push(PG1_POPULATION, freshEnforced.length, committedEnforced.length);
	}

	const committedByName = new Map(
		committedEnforced.map((row) => [row.name, row]),
	);
	for (const row of freshEnforced) {
		const baseline = committedByName.get(row.name);
		if (!baseline) {
			push(row.name, row.entry.measured, "missing from committed");
			continue;
		}
		if (row.entry.measured !== baseline.entry.measured) {
			push(row.name, row.entry.measured, baseline.entry.measured);
		}
		if (row.entry.measured !== row.entry.budget) {
			push(row.name, row.entry.measured, row.entry.budget);
		}
		if (row.entry.blown) {
			push(`${row.name}.blown`, 1, 0);
		}
	}

	return {
		ok: failures.length === 0,
		population: freshEnforced.length,
		failures,
	};
}

export function formatPg1Compare(result: Pg1CompareResult): string {
	const header = `PG1 population: ${result.population} enforced versusSpec rows`;
	if (result.ok) {
		return `${header}\nPG1 compare: counts match`;
	}
	const detail = result.failures.map((failure) => failure.message).join("\n");
	return `${header}\nPG1 compare failed:\n${detail}`;
}

export async function loadPg1Record(
	path = pg1BaselinePath(),
): Promise<Pg1AnchorBudgetRecord> {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error) {
		const code =
			error && typeof error === "object" && "code" in error
				? String(error.code)
				: "";
		if (code === "ENOENT") {
			throw new Error(`${PG1_MISSING}: ${path}`, { cause: error });
		}
		throw error;
	}
	const parsed: unknown = JSON.parse(raw);
	if (!isPg1Record(parsed)) {
		throw new Error(`${PG1_SCHEMA}: ${path} is not a PG1 record`);
	}
	return parsed;
}

export async function writePg1Record(
	record: Pg1AnchorBudgetRecord,
	path = pg1BaselinePath(),
): Promise<void> {
	await writeFile(path, `${JSON.stringify(record, null, "\t")}\n`, "utf8");
}

function enforcedEntries(
	versusSpec: Record<string, Pg1VersusEntry>,
): Array<{ name: string; entry: Pg1VersusEntry }> {
	return Object.entries(versusSpec)
		.filter(([, entry]) => entry.enforced)
		.map(([name, entry]) => ({ name, entry }));
}
