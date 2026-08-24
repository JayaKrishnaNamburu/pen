/**
 * Yjs update bytes embed a random client ID. generateId() (table cells,
 * command newBlockId) is crypto.randomUUID. Both must be pinned or the
 * corpus compares noise, not op semantics.
 *
 * Protocol:
 * - Y.Doc clientID is always 1; guid is always "pen-op-equality-v2"
 * - crypto.randomUUID is an incrementing v4-shaped counter
 * - counter resets to 1 at session start
 * - counter jumps to APPLY_ID_BASE at the first captured apply so
 *   command-time generateId (newBlockId) cannot shift apply-time cell IDs
 *   between record (command then apply) and replay (apply only)
 */

export const FIXED_CLIENT_ID = 1;
export const FIXED_GUID = "pen-op-equality-v2";
export const APPLY_ID_BASE = 10000;

function formatSeededUuid(n) {
	const hex = n.toString(16).padStart(12, "0");
	return `00000000-0000-4000-8000-${hex}`;
}

/**
 * Seeds `crypto.randomUUID` so a recorded op replays with identical ids.
 *
 * `pen/no-bare-random-uuid` (HOST4) flags every `randomUUID` member access, not
 * only calls, and that breadth is correct — a call-only check is evaded by
 * `const g = crypto.randomUUID; g()`. The three accesses below are a stub and
 * its restore rather than id generation, so they are disabled individually
 * instead of narrowing the rule or disabling it for the whole file; a genuine
 * call added here later must still be reported.
 *
 * Stubbing at `crypto` is the only seam available: product code reaches ids
 * through `generateId`, which is an imported binding this harness cannot
 * replace, and which delegates here.
 */
export function installDeterministicIds() {
	// eslint-disable-next-line pen/no-bare-random-uuid -- capture for restore(), not generation
	const original = crypto.randomUUID.bind(crypto);
	let n = 0;
	// eslint-disable-next-line pen/no-bare-random-uuid -- installs the seeded stub
	crypto.randomUUID = () => {
		n += 1;
		return formatSeededUuid(n);
	};
	return {
		reset() {
			n = 0;
		},
		setCounter(value) {
			n = value;
		},
		next() {
			return n + 1;
		},
		restore() {
			// eslint-disable-next-line pen/no-bare-random-uuid -- puts the real implementation back
			crypto.randomUUID = original;
		},
	};
}
