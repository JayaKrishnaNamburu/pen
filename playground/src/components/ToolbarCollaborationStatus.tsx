import type { PeerState } from "@pen/multiplayer";
import { useMultiplayer } from "@pen/react";
import type { Editor } from "@pen/types";
import {
	getCollaborationStatusLabel,
	getCollaborationStatusTone,
	getInitials,
} from "./ToolbarUtils";

type CollaborationStatusProps = {
	editor: Editor;
	room: string;
	userName: string;
};

export function CollaborationStatus({
	editor,
	room,
	userName,
}: CollaborationStatusProps) {
	const multiplayerState = useMultiplayer(editor);
	const statusLabel = getCollaborationStatusLabel(
		multiplayerState.connectionState,
	);
	const statusTone = getCollaborationStatusTone(
		multiplayerState.connectionState,
	);
	const { visiblePeers, overflowCount } = getVisiblePresencePeers(
		multiplayerState.peers,
		4,
	);
	const peerAvatarItems = visiblePeers.map((peer) => (
		<span
			key={getPeerPresenceKey(peer)}
			className="toolbar-collaboration-avatar"
			data-pen-multiplayer-presence-avatar=""
			data-user-id={peer.user.id}
			data-user-name={peer.user.name}
			data-user-color={peer.user.color}
			style={{
				backgroundColor: peer.user.color ?? "var(--accent)",
			}}
			title={peer.user.name}
		>
			{getInitials(peer.user.name)}
		</span>
	));
	const overflowItem =
		overflowCount > 0 ? (
			<span data-pen-multiplayer-presence-overflow="">
				+{overflowCount}
			</span>
		) : null;

	return (
		<div className="toolbar-collaboration">
			<div className="toolbar-collaboration-summary">
				<span
					className="toolbar-collaboration-status"
					data-tone={statusTone}
					title={`Connection: ${statusLabel}`}
				>
					<span className="toolbar-collaboration-status-dot" />
					<span>{statusLabel}</span>
				</span>
				<span
					className="toolbar-collaboration-self"
					title={`You are ${userName}`}
				>
					{userName}
				</span>
			</div>
			<div
				className="toolbar-collaboration-peers"
				data-pen-multiplayer-presence-list=""
				data-overflow-count={overflowCount}
				title={`Room: ${room}`}
			>
				{peerAvatarItems}
				{overflowItem}
			</div>
		</div>
	);
}

function getVisiblePresencePeers(
	peers: readonly PeerState[],
	maxVisible: number,
): {
	visiblePeers: readonly PeerState[];
	overflowCount: number;
} {
	const dedupedPeers = dedupePeersByIdentity(peers);
	return {
		visiblePeers: dedupedPeers.slice(0, maxVisible),
		overflowCount: Math.max(0, dedupedPeers.length - maxVisible),
	};
}

function dedupePeersByIdentity(peers: readonly PeerState[]): PeerState[] {
	const seenKeys = new Set<string>();
	const dedupedPeers: PeerState[] = [];

	for (const peer of peers) {
		const key = getPeerPresenceKey(peer);
		if (seenKeys.has(key)) {
			continue;
		}

		seenKeys.add(key);
		dedupedPeers.push(peer);
	}

	return dedupedPeers;
}

function getPeerPresenceKey(peer: PeerState): string {
	const normalizedName = peer.user.name.trim().toLowerCase();
	if (normalizedName) {
		return `name:${normalizedName}`;
	}

	return `id:${peer.user.id}`;
}
