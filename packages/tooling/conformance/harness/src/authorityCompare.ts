import type { LogicalPoint, DomAuthorityCheck, SerializedSelection } from "../../src/types";

export function pointsEqual(left: LogicalPoint, right: LogicalPoint): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}

export function resolveDomAuthorityCheck(input: {
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
	return compareMappedToAuthority(input.authority, input.mapped);
}

export function compareMappedToAuthority(
	authority: SerializedSelection,
	mapped: { anchor: LogicalPoint; focus: LogicalPoint } | null,
): DomAuthorityCheck {
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

export function misplacedOffset(offset: number, length: number): number {
	if (length <= 0) {
		return offset === 0 ? 1 : 0;
	}
	if (offset === 0) {
		return Math.min(1, length);
	}
	return 0;
}
