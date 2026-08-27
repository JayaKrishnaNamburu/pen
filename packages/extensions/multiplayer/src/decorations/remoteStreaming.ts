import type { BlockDecoration } from "@input/pen-types";
import { createRemotePresenceAttributes } from "../presence/presenceAttributes";
import type { RemoteStreamingState } from "../types";

/**
 * Mark the blocks peers are generating into. This is the collaborator-facing
 * half of an AI run: the block is flagged as busy while the arriving text
 * stays on the client that asked for it (RS1).
 */
export function buildRemoteStreamingDecorations(
	streaming: readonly RemoteStreamingState[],
): BlockDecoration[] {
	return streaming.map((peer) => ({
		type: "block",
		blockId: peer.blockId,
		position: "wrap",
		attributes: createRemotePresenceAttributes({
			className: "pen-multiplayer-streaming",
			markerName: "data-pen-multiplayer-streaming",
			clientId: peer.clientId,
			user: peer.user,
		}),
	}));
}
