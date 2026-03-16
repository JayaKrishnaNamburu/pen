import React, { useContext } from "react";
import type { Editor } from "@pen/types";
import type { PeerState } from "@pen/multiplayer";
import { EditorContext } from "../../context/editorContext";
import { useMultiplayer } from "../../hooks/useMultiplayer";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { isDevelopmentEnvironment } from "../../utils/environment";

export interface MultiplayerPresenceListProps extends AsChildProps {
	editor?: Editor;
	maxVisible?: number;
	renderAvatar?: (peer: PeerState) => React.ReactNode;
	ref?: React.Ref<HTMLElement>;
}

export function MultiplayerPresenceList(
	props: MultiplayerPresenceListProps,
) {
	const { editor: editorProp, maxVisible, renderAvatar, ...rest } = props;
	const editorContext = useContext(EditorContext);
	const editor = editorProp ?? editorContext?.editor;

	if (!editor) {
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: <Pen.Multiplayer.PresenceList> must be used within <Pen.Editor.Root> or receive an editor prop.",
			);
		}
		throw new Error("Missing editor for Pen.Multiplayer.PresenceList");
	}

	const state = useMultiplayer(editor);
	const maxVisibleCount = maxVisible ?? state.peers.length;
	const visiblePeers = state.peers.slice(0, maxVisibleCount);
	const overflowCount = Math.max(0, state.peers.length - visiblePeers.length);

	const defaultPeerAvatars = visiblePeers.map((peer) => (
		<span
			key={peer.clientId}
			data-pen-multiplayer-presence-avatar=""
			data-user-id={peer.user.id}
			data-user-name={peer.user.name}
			data-user-color={peer.user.color}
			title={peer.user.name}
		>
			{peer.user.name}
		</span>
	));

	const renderedPeerAvatars = renderAvatar
		? visiblePeers.map((peer) => (
				<React.Fragment key={peer.clientId}>
					{renderAvatar(peer)}
				</React.Fragment>
			))
		: defaultPeerAvatars;

	const defaultChildren =
		overflowCount > 0
			? [
					...renderedPeerAvatars,
					<span key="overflow" data-pen-multiplayer-presence-overflow="">
						+{overflowCount}
					</span>,
				]
			: renderedPeerAvatars;

	return renderAsChild(
		{
			...rest,
			children: rest.children ?? defaultChildren,
		},
		"div",
		{
			"data-pen-multiplayer-presence-list": "",
			"data-overflow-count": overflowCount,
		},
	);
}
