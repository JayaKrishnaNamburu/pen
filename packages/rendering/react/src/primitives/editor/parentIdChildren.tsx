import React from "react";
import { useEditorContext } from "../../context/editorContext";
import { useParentIdChildBlockIds } from "../../hooks/useParentIdChildBlockIds";
import { EditorBlock } from "./block";

export interface ParentIdChildrenProps {
	parentBlockId: string;
	containerProps?: React.HTMLAttributes<HTMLDivElement> &
		Record<string, unknown>;
}

export function ParentIdChildren(
	props: ParentIdChildrenProps,
): React.ReactElement | null {
	const { parentBlockId, containerProps } = props;
	const { editor } = useEditorContext();
	const childBlockIds = useParentIdChildBlockIds(editor, parentBlockId);

	if (childBlockIds.length === 0) {
		return null;
	}

	const childBlocks = childBlockIds.map((blockId) => (
		<EditorBlock key={blockId} blockId={blockId} />
	));

	return <div {...containerProps}>{childBlocks}</div>;
}
