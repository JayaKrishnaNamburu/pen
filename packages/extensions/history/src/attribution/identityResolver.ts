import {
	HISTORY_CONTROLLER_SLOT,
	MULTIPLAYER_CONTROLLER_SLOT,
} from "@input/pen-types";
import type { Editor } from "@input/pen-types";
import type {
	HistoryAuthor,
	HistoryAuthorIdentity,
	HistoryController,
	OpaqueClientHandle,
	PresenceDisplayHint,
	ResolveHistoryAuthor,
	VerifiedHistoryAuthor,
} from "../types";

interface PresenceUser {
	id?: unknown;
	name?: unknown;
	color?: unknown;
}

interface PresenceIdentitySource {
	getAuthorLedger?(): {
		resolve(clientId: number): PresenceUser | null;
	};
	getIdentityMap?(): {
		get?(clientId: number): PresenceUser | null;
	};
}

export function opaqueClientHandle(clientId: number): OpaqueClientHandle {
	return {
		verified: false,
		id: String(clientId),
		name: `User ${clientId}`,
		clientId,
	};
}

export function resolveHistoryAuthor(
	editor: Editor,
	clientId: number,
	resolveAuthor?: ResolveHistoryAuthor,
): HistoryAuthor {
	const hostResolver = resolveAuthor ?? readHostResolver(editor);
	const identity = hostResolver?.(clientId);
	if (identity) {
		return toVerifiedAuthor(identity);
	}

	return opaqueClientHandle(clientId);
}

export function resolvePresenceDisplayHint(
	editor: Editor,
	clientId: number,
): PresenceDisplayHint | undefined {
	const multiplayerController =
		editor.internals.getSlot<PresenceIdentitySource>(
			MULTIPLAYER_CONTROLLER_SLOT,
		);
	if (!multiplayerController) {
		return undefined;
	}

	if (typeof multiplayerController.getIdentityMap === "function") {
		const identityMap = multiplayerController.getIdentityMap();
		if (typeof identityMap.get === "function") {
			const hint = toPresenceDisplayHint(identityMap.get(clientId));
			if (hint) {
				return hint;
			}
		}
	}

	if (typeof multiplayerController.getAuthorLedger === "function") {
		return toPresenceDisplayHint(
			multiplayerController.getAuthorLedger().resolve(clientId),
		);
	}

	return undefined;
}

function readHostResolver(editor: Editor): ResolveHistoryAuthor | undefined {
	return editor.internals.getSlot<HistoryController>(HISTORY_CONTROLLER_SLOT)
		?.resolveAuthor;
}

function toVerifiedAuthor(identity: HistoryAuthorIdentity): VerifiedHistoryAuthor {
	return {
		verified: true,
		id: identity.id,
		name: identity.name,
		color: identity.color,
	};
}

function toPresenceDisplayHint(
	user: PresenceUser | null | undefined,
): PresenceDisplayHint | undefined {
	if (!user || typeof user.name !== "string" || user.name.length === 0) {
		return undefined;
	}

	return {
		unverified: true,
		name: user.name,
		...(typeof user.id === "string" ? { userId: user.id } : {}),
		...(typeof user.color === "string" ? { color: user.color } : {}),
	};
}
