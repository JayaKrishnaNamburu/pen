import type { SerializedSelectionRecord } from "../../src/types";
import {
	algebraHolds as algebraHoldsFromTrace,
	compareAuthorityTraces as compareAuthorityTracesFromTrace,
	inventoryHolds as inventoryHoldsFromTrace,
	recordAuthorityTraces as recordAuthorityTracesFromTrace,
	type AuthorityTrace,
	type AuthorityTraceCaseDef,
} from "../../src/authorityTrace";

export {
	AUTHORITY_ALGEBRA_AFTER,
	AUTHORITY_TRACE_SCHEMA_VERSION,
	AUTHORITY_TRACE_SCRIPT,
	AUTHORITY_TRACE_SCRIPT_HASH,
	AUTHORITY_TRACE_SCRIPT_ID,
	AUTHORITY_TRACES_PATH,
	MOVING_CASE_IDS,
	authorityCompareKind,
	authorityTraceScriptHash,
	cloneAuthorityTrace,
	describeAuthorityTracePopulation,
	formatAuthorityCompareReport,
	insertOnlyAuthorityScript,
	loadCommittedAuthorityTrace,
	noopAuthorityTrace,
} from "../../src/authorityTrace";
export type {
	AuthorityCompareCheck,
	AuthorityCompareKind,
	AuthorityCompareOutcome,
	AuthorityTrace,
	AuthorityTraceCase,
	AuthorityTraceCaseDef,
	AuthorityTraceKind,
	AuthorityTraceRegion,
	DocumentFingerprint,
} from "../../src/authorityTrace";

export function recordAuthorityTraces(
	script?: readonly AuthorityTraceCaseDef[],
): AuthorityTrace {
	if (script === undefined) {
		return recordAuthorityTracesFromTrace();
	}
	return recordAuthorityTracesFromTrace(script);
}

export function compareAuthorityTraces(
	expected: AuthorityTrace | null | undefined,
	live: AuthorityTrace | null | undefined,
) {
	return compareAuthorityTracesFromTrace(expected, live);
}

export function inventoryHolds(
	recording: AuthorityTrace | null | undefined,
) {
	return inventoryHoldsFromTrace(recording);
}

export function algebraHolds(trace: AuthorityTrace | null | undefined) {
	return algebraHoldsFromTrace(trace);
}

function statesEqual(
	left: SerializedSelectionRecord,
	right: SerializedSelectionRecord,
): boolean {
	return (
		JSON.stringify(left.state) === JSON.stringify(right.state) &&
		left.origin === right.origin
	);
}

export function statesOnlyEqual(
	left: SerializedSelectionRecord,
	right: SerializedSelectionRecord,
): boolean {
	return statesEqual(left, right);
}
