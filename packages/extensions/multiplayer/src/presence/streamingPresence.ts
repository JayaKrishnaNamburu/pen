import type { Editor } from "@input/pen-types";
import type {
	MultiplayerAwarenessState,
	MultiplayerUser,
	RemoteStreamingState,
} from "../types";

/**
 * Resolve which peers have an AI run writing into a live block.
 *
 * There is nothing to hold between commits: the payload names a block rather
 * than a text position, so the resolution is a lookup against the current
 * document instead of an anchor that has to survive repair.
 */
export function resolveRemoteStreaming(
	editor: Editor,
	states: Map<number, MultiplayerAwarenessState>,
	localClientId: number,
	resolveUser: (clientId: number) => MultiplayerUser,
): readonly RemoteStreamingState[] {
	const streaming: RemoteStreamingState[] = [];
	for (const [clientId, state] of states) {
		if (clientId === localClientId) {
			continue;
		}
		const blockId = state.streaming?.blockId;
		if (blockId == null) {
			continue;
		}
		// a commit can remove the block under a run that is still publishing,
		// the way it can shrink a grid under a held cell selection; drop the
		// peer rather than decorate a block that is gone.
		if (!editor.getBlock(blockId)) {
			continue;
		}
		streaming.push({
			clientId,
			user: resolveUser(clientId),
			blockId,
		});
	}
	return streaming;
}
