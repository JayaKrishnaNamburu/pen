import React, { useContext } from "react";
import type { Editor } from "@pen/types";
import type { RemoteCursorState } from "@pen/multiplayer";
import { EditorContext } from "../../context/editorContext";
import { useRemoteCursors } from "../../hooks/useRemoteCursors";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { isDevelopmentEnvironment } from "../../utils/environment";

export interface MultiplayerRemoteCursorsProps extends AsChildProps {
	editor?: Editor;
	renderCursor?: (cursor: RemoteCursorState) => React.ReactNode;
	ref?: React.Ref<HTMLElement>;
}

export function MultiplayerRemoteCursors(
	props: MultiplayerRemoteCursorsProps,
) {
	const { editor: editorProp, renderCursor, ...rest } = props;
	const editorContext = useContext(EditorContext);
	const editor = editorProp ?? editorContext?.editor;

	if (!editor) {
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: <Pen.Multiplayer.RemoteCursors> must be used within <Pen.Editor.Root> or receive an editor prop.",
			);
		}
		throw new Error("Missing editor for Pen.Multiplayer.RemoteCursors");
	}

	const remoteCursors = useRemoteCursors(editor);
	const defaultCursorItems = remoteCursors.map((cursor) => (
		<span
			key={cursor.clientId}
			data-pen-multiplayer-remote-cursor=""
			data-user-id={cursor.user.id}
			data-user-name={cursor.user.name}
			data-user-color={cursor.user.color}
			data-block-id={cursor.blockId}
			data-offset={cursor.offset}
			title={cursor.user.name}
		>
			{cursor.user.name}
		</span>
	));

	const renderedCursorItems = renderCursor
		? remoteCursors.map((cursor) => (
				<React.Fragment key={cursor.clientId}>
					{renderCursor(cursor)}
				</React.Fragment>
			))
		: defaultCursorItems;

	return renderAsChild(
		{
			...rest,
			children: rest.children ?? renderedCursorItems,
		},
		"div",
		{
			"data-pen-multiplayer-remote-cursors": "",
			"data-cursor-count": remoteCursors.length,
		},
	);
}
