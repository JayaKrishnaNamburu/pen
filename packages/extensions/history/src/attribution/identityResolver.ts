import { MULTIPLAYER_CONTROLLER_SLOT } from "@pen/types";
import type { Editor } from "@pen/types";
import type { HistoryAuthor } from "../types";

interface MultiplayerIdentityResolver {
	getAuthorLedger?(): {
		resolve(clientId: number): HistoryAuthor | null;
	};
	getIdentityMap(): {
		resolve(clientId: number): HistoryAuthor;
	};
}

export function resolveHistoryAuthor(
	editor: Editor,
	clientId: number,
): HistoryAuthor {
	const multiplayerController =
		editor.internals.getSlot<MultiplayerIdentityResolver>(
			MULTIPLAYER_CONTROLLER_SLOT,
		);

	if (
		multiplayerController &&
		typeof multiplayerController.getAuthorLedger === "function"
	) {
		const author = multiplayerController.getAuthorLedger().resolve(clientId);
		if (author) {
			return author;
		}
	}

	if (
		multiplayerController &&
		typeof multiplayerController.getIdentityMap === "function"
	) {
		return multiplayerController.getIdentityMap().resolve(clientId);
	}

	return {
		id: String(clientId),
		name: `User ${clientId}`,
	};
}
