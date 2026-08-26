/**
 * PG1 count gate. Clocks in the committed artifact are record-only
 * (CH8). This module reads the JSON and fails by the versusSpec row
 * name. A missing file is PG1_BASELINE_MISSING.
 */

export const PG1_MISSING = "PG1_BASELINE_MISSING";
export const PG1_POPULATION = "PG1_POPULATION";

/**
 * @param {unknown} value
 * @returns {value is { ruleId: string; versusSpec: Record<string, { enforced?: unknown; measured?: unknown; budget?: unknown; blown?: unknown }> }}
 */
export function isPg1Record(value) {
	if (value == null || typeof value !== "object") {
		return false;
	}
	const record =
		/** @type {{ ruleId?: unknown; versusSpec?: unknown; fixture?: unknown }} */ (
			value
		);
	return (
		record.ruleId === "PG1" &&
		record.versusSpec != null &&
		typeof record.versusSpec === "object" &&
		record.fixture != null &&
		typeof record.fixture === "object"
	);
}

/**
 * @param {Record<string, { enforced?: unknown; measured?: unknown; budget?: unknown; blown?: unknown }>} versusSpec
 */
function enforcedRows(versusSpec) {
	return Object.entries(versusSpec)
		.filter(([, entry]) => entry && entry.enforced === true)
		.map(([name, entry]) => ({ name, entry }));
}

/**
 * @param {{ versusSpec: Record<string, { enforced?: unknown; measured?: unknown; budget?: unknown; blown?: unknown }> }} fresh
 * @param {{ versusSpec: Record<string, { enforced?: unknown; measured?: unknown; budget?: unknown; blown?: unknown }> }} committed
 */
export function comparePg1Counts(fresh, committed) {
	const failures = [];
	const freshRows = enforcedRows(fresh.versusSpec);
	const committedRows = enforcedRows(committed.versusSpec);
	if (freshRows.length === 0) {
		failures.push({
			name: PG1_POPULATION,
			message: `PG1 ${PG1_POPULATION}: 0 !== >=1 enforced versusSpec rows`,
		});
	}
	const committedByName = new Map(
		committedRows.map((row) => [row.name, row]),
	);
	for (const row of freshRows) {
		const baseline = committedByName.get(row.name);
		if (!baseline) {
			failures.push({
				name: row.name,
				message: `PG1 ${row.name}: ${row.entry.measured} !== missing from committed`,
			});
			continue;
		}
		if (row.entry.measured !== baseline.entry.measured) {
			failures.push({
				name: row.name,
				message: `PG1 ${row.name}: ${row.entry.measured} !== ${baseline.entry.measured}`,
			});
		}
		if (row.entry.measured !== row.entry.budget) {
			failures.push({
				name: row.name,
				message: `PG1 ${row.name}: ${row.entry.measured} !== ${row.entry.budget}`,
			});
		}
		if (row.entry.blown === true) {
			failures.push({
				name: `${row.name}.blown`,
				message: `PG1 ${row.name}.blown: 1 !== 0`,
			});
		}
	}
	return {
		ok: failures.length === 0,
		population: freshRows.length,
		failures,
	};
}

/**
 * @param {{ ok: boolean; population: number; failures: Array<{ message: string }> }} result
 */
export function formatPg1Compare(result) {
	const header = `PG1 population: ${result.population} enforced versusSpec rows`;
	if (result.ok) {
		return `${header}\nPG1 compare: counts match`;
	}
	return `${header}\nPG1 compare failed:\n${result.failures.map((failure) => failure.message).join("\n")}`;
}
