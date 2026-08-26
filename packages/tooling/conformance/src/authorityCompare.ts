// corpus, hash, recording, and headless replay live in ./authorityTrace — one
// script, one hash. this file keeps the standing DOM↔authority replay so the
// node host does not import the harness app.
import { authorityCheckKind } from "./standingFilter.js";
import type {
	AuthorityCompareCheck,
	AuthorityCompareKind,
} from "./authorityTrace";
import type {
	DomAuthorityCheck,
	LogicalPoint,
	SerializedSelection,
} from "./types";

export type DomAuthorityObservation = {
	id: string;
	hasRoot: boolean;
	hasFocus: boolean;
	authority: SerializedSelection;
	mapped: { anchor: LogicalPoint; focus: LogicalPoint } | null;
};

function pointsEqual(left: LogicalPoint, right: LogicalPoint): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}

function matched(): AuthorityCompareCheck {
	return { ok: true, outcome: "matched" };
}

function mismatch(reason: string, caseId?: string): AuthorityCompareCheck {
	return {
		ok: false,
		outcome: "mismatch",
		kind: "implementation",
		reason,
		caseId,
	};
}

function unchecked(
	kind: AuthorityCompareKind,
	reason: string,
	caseId?: string,
): AuthorityCompareCheck {
	return {
		ok: false,
		skipped: true,
		stale: kind === "stale-recording",
		outcome: "unchecked",
		kind,
		reason,
		caseId,
	};
}

/**
 * Same three-way as `resolveDomAuthorityCheck`. Kept here so the replay
 * does not import the harness app. Unfocused and non-text are skipped.
 */
export function observeDomAuthority(input: {
	hasRoot: boolean;
	hasFocus: boolean;
	authority: SerializedSelection;
	mapped: { anchor: LogicalPoint; focus: LogicalPoint } | null;
}): DomAuthorityCheck {
	if (!input.hasRoot) {
		return { ok: false, reason: "editor root is not mounted" };
	}
	if (!input.hasFocus) {
		return {
			ok: false,
			skipped: true,
			reason: "editor is unfocused",
			authority: input.authority,
			dom: input.mapped,
		};
	}
	const authority = input.authority;
	const mapped = input.mapped;
	if (authority == null) {
		if (mapped == null) {
			return { ok: true, authority, dom: mapped };
		}
		return {
			ok: false,
			reason: "DOM has a selection while editor.selection is null",
			authority,
			dom: mapped,
		};
	}
	if (authority.type !== "text") {
		return {
			ok: false,
			skipped: true,
			reason: "authority is not a text selection",
			authority,
			dom: mapped,
		};
	}
	if (!mapped) {
		return {
			ok: false,
			reason: "DOM selection does not map to a logical text selection",
			authority,
			dom: mapped,
		};
	}
	if (
		pointsEqual(mapped.anchor, authority.anchor) &&
		pointsEqual(mapped.focus, authority.focus)
	) {
		return { ok: true, authority, dom: mapped };
	}
	return {
		ok: false,
		reason: "DOM selection does not match editor.selection (v1 authority)",
		authority,
		dom: mapped,
	};
}

export function liftDomAuthorityCheck(
	check: DomAuthorityCheck,
	caseId?: string,
): AuthorityCompareCheck {
	const kind = authorityCheckKind(check);
	if (kind === "unchecked") {
		const reason = check.reason ?? "could not check";
		const detail: AuthorityCompareKind = reason.includes("unfocused")
			? "unfocused"
			: reason.includes("not a text")
				? "non-text"
				: "missing";
		return unchecked(detail, reason, caseId);
	}
	if (kind === "mismatch") {
		return mismatch(
			check.reason ?? "DOM and editor.selection disagree",
			caseId,
		);
	}
	return matched();
}

export function replayDomAuthorityObservation(
	observation: DomAuthorityObservation,
): AuthorityCompareCheck {
	return liftDomAuthorityCheck(
		observeDomAuthority(observation),
		observation.id,
	);
}

/**
 * Aggregate recorded observations. Any mismatch fails. Any unchecked
 * (and no mismatch) is unchecked — not a hold. Only all-matched holds.
 */
export function aggregateAuthorityChecks(
	results: readonly AuthorityCompareCheck[],
): AuthorityCompareCheck {
	if (results.length === 0) {
		return unchecked("missing", "no recorded observations");
	}
	let firstUnchecked: AuthorityCompareCheck | undefined;
	for (const result of results) {
		if (result.outcome === "mismatch") {
			return result;
		}
		if (result.outcome === "unchecked" && firstUnchecked === undefined) {
			firstUnchecked = result;
		}
	}
	if (firstUnchecked !== undefined) {
		return firstUnchecked;
	}
	return matched();
}

export function replayDomAuthorityTrace(
	observations: readonly DomAuthorityObservation[],
): AuthorityCompareCheck {
	return aggregateAuthorityChecks(
		observations.map((observation) =>
			replayDomAuthorityObservation(observation),
		),
	);
}
