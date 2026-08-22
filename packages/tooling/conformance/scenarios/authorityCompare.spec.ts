import { expect, test } from "@playwright/test";
import {
	algebraHolds,
	applyAlgebraLandings,
	compareAuthorityTraces,
	describeAuthorityTracePopulation,
	inventoryHolds,
	loadCommittedAuthorityTrace,
	recordAuthorityTraces,
} from "../harness/src/authorityCompare";

test("authorityCompare: structural traces replay against the algebra oracle", () => {
	const committed = loadCommittedAuthorityTrace();
	const live = recordAuthorityTraces();
	console.log(describeAuthorityTracePopulation(committed));

	const inventory = inventoryHolds(committed);
	expect(inventory.outcome, inventory.reason).toBe("matched");

	const oracle = algebraHolds(committed);
	expect(oracle.outcome, oracle.reason).toBe("matched");

	const self = compareAuthorityTraces(committed, committed);
	expect(self.outcome, self.reason).toBe("could-not-check");
	expect(self.kind).toBe("self-replay");

	const liveReplay = compareAuthorityTraces(committed, live);
	expect(liveReplay.outcome, liveReplay.reason).toBe("mismatch");
	expect(liveReplay.reason ?? "").toMatch(/split-point|split-tail|merge-/);

	const retargeted = compareAuthorityTraces(
		committed,
		applyAlgebraLandings(live),
	);
	expect(retargeted.outcome, retargeted.reason).toBe("matched");
});
