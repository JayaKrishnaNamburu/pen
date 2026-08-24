import { expect, test } from "@playwright/test";
import {
	algebraHolds,
	cloneAuthorityTrace,
	compareAuthorityTraces,
	describeAuthorityTracePopulation,
	inventoryHolds,
	loadCommittedAuthorityTrace,
	noopAuthorityTrace,
	recordAuthorityTraces,
} from "../harness/src/authorityCompare";

test("authorityCompare: structural traces replay against the algebra oracle", () => {
	const committed = loadCommittedAuthorityTrace();
	const live = recordAuthorityTraces();
	console.log(describeAuthorityTracePopulation(committed));
	expect(committed, "committed recording must be present").not.toBeNull();
	if (committed === null) return;

	const inventory = inventoryHolds(committed);
	expect(inventory.outcome, inventory.reason).toBe("matched");

	const oracle = algebraHolds(committed);
	expect(oracle.outcome, oracle.reason).toBe("matched");

	const self = compareAuthorityTraces(committed, committed);
	expect(self.outcome, self.reason).toBe("unchecked");
	expect(self.kind).toBe("self-replay");

	const liveReplay = compareAuthorityTraces(committed, live);
	expect(liveReplay.outcome, liveReplay.reason).toBe("matched");

	const stalled = compareAuthorityTraces(
		committed,
		noopAuthorityTrace(cloneAuthorityTrace(committed)),
	);
	expect(stalled.outcome, stalled.reason).toBe("mismatch");
	expect(stalled.reason ?? "").toMatch(/split-point|split-tail|merge-/);
});
