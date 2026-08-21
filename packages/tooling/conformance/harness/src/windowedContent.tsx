import { useEditorContext } from "../../../../rendering/react/src/context/editorContext";
import { useFieldEditorContext } from "../../../../rendering/react/src/context/fieldEditorContext";
import { useBlockList } from "../../../../rendering/react/src/hooks/useBlockList";
import { Pen } from "../../../../rendering/react/src/primitives";
import type { ReactElement } from "react";
import { WINDOWED_WINDOW_SIZE } from "../../fixtures/catalog";

export function WindowedContent({
	windowStart,
}: {
	windowStart: number;
}): ReactElement {
	const { editor } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const blockIds = useBlockList(editor);
	const mountedIds = blockIds.slice(
		windowStart,
		windowStart + WINDOWED_WINDOW_SIZE,
	);

	const blockItems = mountedIds.map((blockId) => (
		<Pen.Editor.Block key={blockId} blockId={blockId} />
	));

	return (
		<div
			data-pen-editor-content=""
			data-pen-windowed=""
			data-window-start={String(windowStart)}
			data-window-size={String(WINDOWED_WINDOW_SIZE)}
			onClick={(event) => {
				const host = (event.target as HTMLElement | null)?.closest(
					"[data-pen-editor-block]",
				);
				const blockId = host?.getAttribute("data-block-id");
				if (!blockId || !fieldEditor) {
					return;
				}
				editor.selectText(blockId, 0, 0);
				fieldEditor.activate(blockId);
				fieldEditor.focus({ reason: "user-pointer" });
			}}
		>
			{blockItems}
		</div>
	);
}
