import { describe, expect, it } from "vitest";
import { BIDI_ATOM_MARKER, computeBidiRuns, type BidiRun } from "../levels";
import { BIDI_VECTORS } from "./vectors";

function assertPartition(text: string, runs: readonly BidiRun[]): void {
	const logical = [...runs].sort((a, b) => a.from - b.from);
	let offset = 0;
	for (const run of logical) {
		expect(run.from).toBe(offset);
		expect(run.to).toBeGreaterThan(run.from);
		expect(run.level).toBeGreaterThanOrEqual(0);
		offset = run.to;
	}
	expect(offset).toBe(text.length);
}

describe("BR1 computeBidiRuns", () => {
	it(`BR1: ${BIDI_VECTORS.length} representative vectors match run-level output`, () => {
		for (const vector of BIDI_VECTORS) {
			const runs = computeBidiRuns(vector.text, vector.base);
			expect(runs, vector.id).toEqual(vector.runs);
			if (vector.text.length > 0) {
				assertPartition(vector.text, runs);
			}
		}
	});

	it("BR1: latin / arabic / hebrew / digits keep even=ltr odd=rtl levels", () => {
		expect(computeBidiRuns("Input", "ltr")).toEqual([
			{ from: 0, to: 5, level: 0 },
		]);
		expect(computeBidiRuns("بريد", "rtl")).toEqual([
			{ from: 0, to: 4, level: 1 },
		]);
		expect(computeBidiRuns("דואר", "rtl")).toEqual([
			{ from: 0, to: 4, level: 1 },
		]);
		expect(computeBidiRuns("42", "rtl")[0]?.level).toBe(2);
	});

	it("BR1: LRI/RLI/FSI/PDI isolates do not leak direction into the outer run", () => {
		const lri = computeBidiRuns("A\u2066مرحبا\u2069B", "ltr");
		expect(lri.some((run) => run.level % 2 === 1)).toBe(true);
		expect(lri[0]).toMatchObject({ from: 0, level: 0 });
		expect(lri[lri.length - 1]).toMatchObject({
			to: 9,
			level: 0,
		});

		const rli = computeBidiRuns("A\u2067XYZ\u2069B", "ltr");
		const isolated = rli.find((run) => run.from === 2 && run.to === 5);
		expect(isolated?.level).toBe(2);
	});
});

describe("BR2 atom run boundaries", () => {
	it("BR2: U+FFFC is Bidi_Class ON and always its own run", () => {
		const runs = computeBidiRuns(`ab${BIDI_ATOM_MARKER}cd`, "ltr");
		expect(runs).toEqual([
			{ from: 0, to: 2, level: 0 },
			{ from: 2, to: 3, level: 0 },
			{ from: 3, to: 5, level: 0 },
		]);
	});

	it("BR2: adjacent atoms stay separate runs inside an rtl sequence", () => {
		const runs = computeBidiRuns(
			`م${BIDI_ATOM_MARKER}${BIDI_ATOM_MARKER}ر`,
			"rtl",
		);
		const logical = [...runs].sort((a, b) => a.from - b.from);
		expect(logical.map((run) => [run.from, run.to])).toEqual([
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
		]);
		expect(logical.every((run) => run.level === 1)).toBe(true);
	});
});
