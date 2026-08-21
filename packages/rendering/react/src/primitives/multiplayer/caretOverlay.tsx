import React, { useContext } from "react";
import { measureWithRoot, type Rect } from "@input/pen-dom";
import type {
	PeerState,
	RemoteCursorState,
} from "@input/pen-multiplayer";
import type { Editor } from "@input/pen-types";
import { EditorContext } from "../../context/editorContext";
import { useMultiplayer } from "../../hooks/useMultiplayer";
import { useOverlayLayout } from "../../hooks/useOverlayLayout";
import { useRemoteCursors } from "../../hooks/useRemoteCursors";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
type MultiplayerStyle = React.CSSProperties & Record<string, string | number>;

export interface MultiplayerCaretRenderProps {
	cursor: RemoteCursorState;
	peer: PeerState | null;
	caretStyle: MultiplayerStyle;
	labelStyle: MultiplayerStyle;
	attributes: Record<string, string | undefined>;
}

export interface MultiplayerCaretOverlayProps extends AsChildProps {
	editor?: Editor;
	renderCaret?: (props: MultiplayerCaretRenderProps) => React.ReactNode;
	renderLabel?: (props: MultiplayerCaretRenderProps) => React.ReactNode;
	ref?: React.Ref<HTMLElement>;
}

export function MultiplayerCaretOverlay(
	props: MultiplayerCaretOverlayProps,
) {
	const {
		editor: editorProp,
		renderCaret,
		renderLabel,
		...rest
	} = props;
	const editorContext = useContext(EditorContext);
	const editor = editorProp ?? editorContext?.editor;

	if (!editor) {
		throw new Error("Missing editor for Pen.Multiplayer.CaretOverlay");
	}

	const multiplayerState = useMultiplayer(editor);
	const remoteCursors = useRemoteCursors(editor);
	const { elementRef, rootElement } = useOverlayLayout<HTMLElement>([
		remoteCursors,
		multiplayerState.peers,
	]);

	const peerMap = new Map<number, PeerState>();
	for (const peer of multiplayerState.peers) {
		peerMap.set(peer.clientId, peer);
	}

	const overlayItems: React.ReactNode[] = [];
	for (const cursor of remoteCursors) {
		if (!rootElement) {
			continue;
		}

		const rect = readCaretRect(rootElement, {
			blockId: cursor.blockId,
			offset: cursor.offset,
		});
		if (!rect) {
			continue;
		}

		const renderProps = createCaretRenderProps(
			cursor,
			peerMap.get(cursor.clientId) ?? null,
			rect,
		);
		const caretNode = renderCaret
			? renderCaret(renderProps)
			: (
				<div
					{...renderProps.attributes}
					style={renderProps.caretStyle}
				/>
			);
		const labelNode = renderLabel
			? renderLabel(renderProps)
			: (
				<div
					{...renderProps.attributes}
					data-pen-multiplayer-caret-label=""
					style={renderProps.labelStyle}
				>
					{cursor.user.name}
				</div>
			);

		overlayItems.push(
			<React.Fragment
				key={`multiplayer-caret-overlay:${cursor.clientId}:${cursor.blockId}:${cursor.offset}:${cursor.clock}`}
			>
				{caretNode}
				{labelNode}
			</React.Fragment>,
		);
	}

	return renderAsChild(
		{
			...rest,
			ref: elementRef,
			children: rest.children ?? overlayItems,
		},
		"div",
		{
			"data-pen-multiplayer-caret-overlay": "",
			"data-cursor-count": String(remoteCursors.length),
			// AX7 overlay — collaborator caret is presentation
			"aria-hidden": "true",
			style: {
				pointerEvents: "none",
			},
		},
	);
}

function readCaretRect(
	root: HTMLElement,
	point: { blockId: string; offset: number },
): Rect | null {
	return measureWithRoot(root, ({ reader }) =>
		reader.caretRect(point, "downstream"),
	);
}

function createCaretRenderProps(
	cursor: RemoteCursorState,
	peer: PeerState | null,
	rect: Rect,
): MultiplayerCaretRenderProps {
	const color = cursor.user.color ?? "currentColor";
	const caretStyle: MultiplayerStyle = {
		position: "fixed",
		left: `${rect.left}px`,
		top: `${rect.top}px`,
		height: `${Math.max(rect.height, 16)}px`,
		width: "var(--pen-caret-width, 2px)",
		borderRadius: "var(--pen-caret-radius, 999px)",
		background: "var(--pen-peer-color)",
		pointerEvents: "none",
		zIndex: 20,
		"--pen-peer-color": color,
		"--pen-caret-height": `${Math.max(rect.height, 16)}px`,
	};
	const labelStyle: MultiplayerStyle = {
		position: "fixed",
		left: `${rect.left}px`,
		top: `${Math.max(rect.top - 8, 0)}px`,
		transform: "translateY(-100%)",
		padding: "2px 6px",
		borderRadius: "6px",
		background: "var(--pen-peer-color)",
		color: "var(--pen-peer-label-color, #fff)",
		fontSize: "12px",
		lineHeight: 1.2,
		whiteSpace: "nowrap",
		pointerEvents: "none",
		zIndex: 20,
		"--pen-peer-color": color,
	};
	const attributes = {
		"data-pen-multiplayer-caret": "",
		"data-client-id": String(cursor.clientId),
		"data-user-id": cursor.user.id,
		"data-user-name": cursor.user.name,
		"data-user-color": cursor.user.color,
		"data-block-id": cursor.blockId,
	};

	return {
		cursor,
		peer,
		caretStyle,
		labelStyle,
		attributes,
	};
}
