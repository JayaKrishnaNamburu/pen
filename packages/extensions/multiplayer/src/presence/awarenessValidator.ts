import { urlPolicy } from "@input/pen-core";
import { normalizeMultiplayerColor } from "./colorAssignment";
import {
	MAX_PRESENCE_AVATAR_URL_LENGTH,
	MAX_PRESENCE_BLOCK_SELECTION_IDS,
	MAX_PRESENCE_BYTES_PER_PEER,
	MAX_PRESENCE_COLOR_LENGTH,
	MAX_PRESENCE_DISPLAY_NAME_LENGTH,
	MAX_PRESENCE_OFFSET,
	MAX_PRESENCE_USER_ID_LENGTH,
	type PresenceRejectionReason,
} from "./constants";
import type {
	MultiplayerAwarenessState,
	MultiplayerBlockSelectionPayload,
	MultiplayerCursorPayload,
	MultiplayerSelectionPayload,
	MultiplayerTextSelectionPayload,
	MultiplayerUser,
} from "../types";

export interface PresenceRejection {
	clientId: number;
	reason: PresenceRejectionReason;
}

export interface AwarenessDocumentView {
	blockLength(blockId: string): number | null;
}

export interface AwarenessValidationResult {
	states: Map<number, MultiplayerAwarenessState>;
	rejections: PresenceRejection[];
}

export interface AwarenessValidationOptions {
	resolveAvatarUrl?: (raw: string) => string | null;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp|avif)/i;

export function validateAwarenessStates(
	states: Map<number, unknown>,
	document: AwarenessDocumentView,
	localClientId: number,
	options?: AwarenessValidationOptions,
): AwarenessValidationResult {
	const accepted = new Map<number, MultiplayerAwarenessState>();
	const rejections: PresenceRejection[] = [];

	for (const [clientId, rawState] of states) {
		if (clientId === localClientId) {
			if (isRecord(rawState)) {
				accepted.set(clientId, rawState as MultiplayerAwarenessState);
			}
			continue;
		}

		try {
			const validated = validatePeerState(rawState, document, options);
			if (validated.rejection) {
				rejections.push({ clientId, reason: validated.rejection });
			}
			for (const reason of validated.fieldRejections) {
				rejections.push({ clientId, reason });
			}
			if (validated.state) {
				accepted.set(clientId, validated.state);
			}
		} catch {
			rejections.push({ clientId, reason: "wrong-typed" });
		}
	}

	return { states: accepted, rejections };
}

function validatePeerState(
	rawState: unknown,
	document: AwarenessDocumentView,
	options?: AwarenessValidationOptions,
): {
	state: MultiplayerAwarenessState | null;
	rejection: PresenceRejectionReason | null;
	fieldRejections: PresenceRejectionReason[];
} {
	if (!isRecord(rawState) || hasForbiddenKeys(rawState)) {
		return { state: null, rejection: "wrong-typed", fieldRejections: [] };
	}

	const byteLength = utf8ByteLength(rawState);
	if (byteLength > MAX_PRESENCE_BYTES_PER_PEER) {
		return { state: null, rejection: "oversized", fieldRejections: [] };
	}

	let user: MultiplayerUser | undefined;
	if (rawState.user !== undefined) {
		const userResult = validateUser(rawState.user, options);
		if (userResult.reason) {
			return {
				state: null,
				rejection: userResult.reason,
				fieldRejections: [],
			};
		}
		user = userResult.user;
	}

	const fieldRejections: PresenceRejectionReason[] = [];
	const cursorResult = validateCursor(rawState.cursor, document);
	if (cursorResult.reason) {
		fieldRejections.push(cursorResult.reason);
	}

	const selectionResult = validateSelection(rawState.selection, document);
	if (selectionResult.reason) {
		fieldRejections.push(selectionResult.reason);
	}

	return {
		state: {
			user,
			cursor: cursorResult.cursor,
			selection: selectionResult.selection,
		},
		rejection: null,
		fieldRejections,
	};
}

function validateUser(
	value: unknown,
	options?: AwarenessValidationOptions,
):
	| { user: MultiplayerUser; reason?: undefined }
	| { user?: undefined; reason: PresenceRejectionReason } {
	if (!isRecord(value) || hasForbiddenKeys(value)) {
		return { reason: "wrong-typed" };
	}
	if (typeof value.id !== "string" || typeof value.name !== "string") {
		return { reason: "wrong-typed" };
	}
	if (value.color != null && typeof value.color !== "string") {
		return { reason: "wrong-typed" };
	}
	if (value.avatar != null && typeof value.avatar !== "string") {
		return { reason: "wrong-typed" };
	}
	if (
		value.id.length > MAX_PRESENCE_USER_ID_LENGTH ||
		value.name.length > MAX_PRESENCE_DISPLAY_NAME_LENGTH ||
		(typeof value.avatar === "string" &&
			value.avatar.length > MAX_PRESENCE_AVATAR_URL_LENGTH)
	) {
		return { reason: "oversized" };
	}
	if (isScriptBearing(value.id) || isScriptBearing(value.name)) {
		return { reason: "script-bearing" };
	}

	const user: MultiplayerUser = {
		id: value.id,
		name: value.name,
	};

	if (typeof value.color === "string") {
		if (isScriptBearing(value.color)) {
			return { reason: "script-bearing" };
		}
		if (value.color.length <= MAX_PRESENCE_COLOR_LENGTH) {
			const color = normalizeMultiplayerColor(value.color, "");
			if (color) {
				user.color = color;
			}
		}
	}

	if (typeof value.avatar === "string") {
		if (isScriptBearing(value.avatar) || isHostileAvatarUrl(value.avatar)) {
			return { reason: "script-bearing" };
		}
		const avatar = resolvePresenceAvatarUrl(
			value.avatar,
			options?.resolveAvatarUrl,
		);
		if (avatar) {
			user.avatar = avatar;
		}
	}

	return { user };
}

function validateCursor(
	value: unknown,
	document: AwarenessDocumentView,
): {
	cursor: MultiplayerCursorPayload | null;
	reason: PresenceRejectionReason | null;
} {
	if (value == null) {
		return { cursor: null, reason: null };
	}
	if (!isRecord(value) || hasForbiddenKeys(value)) {
		return { cursor: null, reason: "wrong-typed" };
	}
	if (typeof value.blockId !== "string") {
		return { cursor: null, reason: "wrong-typed" };
	}
	if (!isPresenceInteger(value.offset)) {
		return { cursor: null, reason: "wrong-typed" };
	}
	if (value.offset > MAX_PRESENCE_OFFSET) {
		return { cursor: null, reason: "oversized" };
	}
	if (value.clock !== undefined && !isPresenceInteger(value.clock)) {
		return { cursor: null, reason: "wrong-typed" };
	}
	if (value.commitId !== undefined && !isPresenceInteger(value.commitId)) {
		return { cursor: null, reason: "wrong-typed" };
	}
	if (value.blockId.length > MAX_PRESENCE_USER_ID_LENGTH) {
		return { cursor: null, reason: "oversized" };
	}
	if (isScriptBearing(value.blockId)) {
		return { cursor: null, reason: "script-bearing" };
	}

	const point = resolveDocumentPoint(value.blockId, value.offset, document);
	if (
		point.reason &&
		!(
			point.reason === "out-of-range-offset" &&
			isPresenceInteger(value.commitId)
		)
	) {
		return { cursor: null, reason: point.reason };
	}

	return {
		cursor: {
			blockId: value.blockId,
			offset: value.offset,
			clock: isPresenceInteger(value.clock) ? value.clock : 0,
			...(isPresenceInteger(value.commitId)
				? { commitId: value.commitId }
				: {}),
		},
		reason: null,
	};
}

function validateSelection(
	value: unknown,
	document: AwarenessDocumentView,
): {
	selection: MultiplayerSelectionPayload | null;
	reason: PresenceRejectionReason | null;
} {
	if (value == null) {
		return { selection: null, reason: null };
	}
	if (!isRecord(value) || hasForbiddenKeys(value)) {
		return { selection: null, reason: "wrong-typed" };
	}
	if (value.clock !== undefined && !isPresenceInteger(value.clock)) {
		return { selection: null, reason: "wrong-typed" };
	}
	if (value.commitId !== undefined && !isPresenceInteger(value.commitId)) {
		return { selection: null, reason: "wrong-typed" };
	}

	if (value.kind === "block") {
		return validateBlockSelection(value, document);
	}
	if (value.kind !== undefined && value.kind !== "text") {
		return { selection: null, reason: "wrong-typed" };
	}
	return validateTextSelection(value, document);
}

function validateTextSelection(
	value: Record<string, unknown>,
	document: AwarenessDocumentView,
): {
	selection: MultiplayerTextSelectionPayload | null;
	reason: PresenceRejectionReason | null;
} {
	const allowStaleOffset = isPresenceInteger(value.commitId);
	const anchor = validatePoint(value.anchor, document, allowStaleOffset);
	if (anchor.reason) {
		return { selection: null, reason: anchor.reason };
	}
	const head = validatePoint(value.head, document, allowStaleOffset);
	if (head.reason) {
		return { selection: null, reason: head.reason };
	}
	if (!anchor.point || !head.point) {
		return { selection: null, reason: "wrong-typed" };
	}

	return {
		selection: {
			kind: "text",
			anchor: anchor.point,
			head: head.point,
			clock: isPresenceInteger(value.clock) ? value.clock : 0,
			...(isPresenceInteger(value.commitId)
				? { commitId: value.commitId }
				: {}),
		},
		reason: null,
	};
}

function validateBlockSelection(
	value: Record<string, unknown>,
	document: AwarenessDocumentView,
): {
	selection: MultiplayerBlockSelectionPayload | null;
	reason: PresenceRejectionReason | null;
} {
	if (!Array.isArray(value.blockIds)) {
		return { selection: null, reason: "wrong-typed" };
	}
	if (value.blockIds.length > MAX_PRESENCE_BLOCK_SELECTION_IDS) {
		return { selection: null, reason: "oversized" };
	}

	const blockIds: string[] = [];
	for (const blockId of value.blockIds) {
		if (typeof blockId !== "string") {
			return { selection: null, reason: "wrong-typed" };
		}
		if (blockId.length > MAX_PRESENCE_USER_ID_LENGTH) {
			return { selection: null, reason: "oversized" };
		}
		if (isScriptBearing(blockId)) {
			return { selection: null, reason: "script-bearing" };
		}
		if (document.blockLength(blockId) == null) {
			return { selection: null, reason: "nonexistent-block" };
		}
		blockIds.push(blockId);
	}

	return {
		selection: {
			kind: "block",
			blockIds,
			clock: isPresenceInteger(value.clock) ? value.clock : 0,
			...(isPresenceInteger(value.commitId)
				? { commitId: value.commitId }
				: {}),
		},
		reason: null,
	};
}

function validatePoint(
	value: unknown,
	document: AwarenessDocumentView,
	allowStaleOffset = false,
): {
	point: { blockId: string; offset: number } | null;
	reason: PresenceRejectionReason | null;
} {
	if (!isRecord(value) || hasForbiddenKeys(value)) {
		return { point: null, reason: "wrong-typed" };
	}
	if (typeof value.blockId !== "string" || !isPresenceInteger(value.offset)) {
		return { point: null, reason: "wrong-typed" };
	}
	if (value.offset > MAX_PRESENCE_OFFSET) {
		return { point: null, reason: "oversized" };
	}
	if (value.blockId.length > MAX_PRESENCE_USER_ID_LENGTH) {
		return { point: null, reason: "oversized" };
	}
	if (isScriptBearing(value.blockId)) {
		return { point: null, reason: "script-bearing" };
	}
	const resolved = resolveDocumentPoint(
		value.blockId,
		value.offset,
		document,
	);
	if (
		resolved.reason &&
		!(allowStaleOffset && resolved.reason === "out-of-range-offset")
	) {
		return { point: null, reason: resolved.reason };
	}
	return {
		point: { blockId: value.blockId, offset: value.offset },
		reason: null,
	};
}

function resolveDocumentPoint(
	blockId: string,
	offset: number,
	document: AwarenessDocumentView,
): { reason: PresenceRejectionReason | null } {
	const length = document.blockLength(blockId);
	if (length == null) {
		return { reason: "nonexistent-block" };
	}
	if (offset < 0 || offset > length) {
		return { reason: "out-of-range-offset" };
	}
	return { reason: null };
}

function resolvePresenceAvatarUrl(
	raw: string,
	resolveUrl: ((value: string) => string | null) | undefined,
): string | null {
	const admitted = (resolveUrl ?? defaultResolveAvatarUrl)(raw);
	if (!admitted) {
		return null;
	}
	try {
		const protocol = new URL(
			admitted,
			"https://pen.invalid/",
		).protocol.toLowerCase();
		if (protocol === "http:" || protocol === "https:") {
			return admitted;
		}
		if (protocol === "data:" && IMAGE_DATA_URL.test(admitted.trim())) {
			return admitted;
		}
		return null;
	} catch {
		// invalid avatar url is not admitted.
		return null;
	}
}

function defaultResolveAvatarUrl(raw: string): string | null {
	return urlPolicy.resolve(raw, "image");
}

function isHostileAvatarUrl(raw: string): boolean {
	try {
		const protocol = new URL(
			raw,
			"https://pen.invalid/",
		).protocol.toLowerCase();
		return (
			protocol === "javascript:" ||
			protocol === "vbscript:" ||
			(protocol === "data:" && !IMAGE_DATA_URL.test(raw.trim()))
		);
	} catch {
		// unparsable url still counts as hostile if it looks script-bearing.
		return isScriptBearing(raw);
	}
}

function utf8ByteLength(value: unknown): number {
	try {
		return new TextEncoder().encode(JSON.stringify(value)).length;
	} catch {
		// unstringifiable awareness payload exceeds any size budget.
		return Number.POSITIVE_INFINITY;
	}
}

function isScriptBearing(value: string): boolean {
	// the control characters are the point: stripping them first stops a payload
	// hiding `<script>` behind them from reading as inert.
	// eslint-disable-next-line no-control-regex
	const text = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().toLowerCase();
	return (
		text.includes("javascript:") ||
		text.includes("vbscript:") ||
		containsPrefixedToken(text, "<", "script") ||
		containsPrefixedToken(text, "data:", "text/html") ||
		containsInlineHandler(text)
	);
}

function containsPrefixedToken(
	text: string,
	prefix: string,
	token: string,
): boolean {
	let from = 0;
	while (from < text.length) {
		const at = text.indexOf(prefix, from);
		if (at === -1) {
			return false;
		}
		let i = at + prefix.length;
		while (i < text.length && /\s/.test(text[i] ?? "")) {
			i += 1;
		}
		if (text.startsWith(token, i)) {
			return true;
		}
		from = at + 1;
	}
	return false;
}

function containsInlineHandler(text: string): boolean {
	let from = 0;
	while (from < text.length) {
		const at = text.indexOf("on", from);
		if (at === -1) {
			return false;
		}
		let i = at + 2;
		if (i >= text.length || !isAsciiWordChar(text.charCodeAt(i))) {
			from = at + 1;
			continue;
		}
		i += 1;
		while (i < text.length && isAsciiWordChar(text.charCodeAt(i))) {
			i += 1;
		}
		while (i < text.length && /\s/.test(text[i] ?? "")) {
			i += 1;
		}
		if (text[i] === "=") {
			return true;
		}
		from = at + 1;
	}
	return false;
}

function isAsciiWordChar(code: number): boolean {
	return (
		(code >= 48 && code <= 57) ||
		(code >= 97 && code <= 122) ||
		code === 95
	);
}

function isPresenceInteger(value: unknown): value is number {
	return (
		typeof value === "number" && Number.isSafeInteger(value) && value >= 0
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenKeys(value: Record<string, unknown>): boolean {
	for (const key of FORBIDDEN_KEYS) {
		if (Object.prototype.hasOwnProperty.call(value, key)) {
			return true;
		}
	}
	return false;
}
