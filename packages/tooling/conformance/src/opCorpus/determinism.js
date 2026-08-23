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

export function installDeterministicIds() {
	const original = crypto.randomUUID.bind(crypto);
	let n = 0;
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
			crypto.randomUUID = original;
		},
	};
}
