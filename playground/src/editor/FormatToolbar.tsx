import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { Pen } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import { IconButton } from "../ui/IconButton";
import {
	IconBold,
	IconCode,
	IconItalic,
	IconPanelRight,
	IconRedo,
	IconStrikethrough,
	IconUnderline,
	IconUndo,
} from "../ui/Icon";

interface FormatToolbarProps {
	editor: Editor;
	isInspectorOpen: boolean;
	onToggleInspector: () => void;
}

const INLINE_MARKS = [
	{ format: "bold", label: "Bold", icon: <IconBold /> },
	{ format: "italic", label: "Italic", icon: <IconItalic /> },
	{ format: "underline", label: "Underline", icon: <IconUnderline /> },
	{ format: "strikethrough", label: "Strikethrough", icon: <IconStrikethrough /> },
	{ format: "code", label: "Code", icon: <IconCode /> },
];

export function FormatToolbar({
	editor,
	isInspectorOpen,
	onToggleInspector,
}: FormatToolbarProps) {
	const undoState = useUndoState(editor);

	const markToggles = INLINE_MARKS.map((mark) => (
		<MarkToggle key={mark.format} format={mark.format} label={mark.label}>
			{mark.icon}
		</MarkToggle>
	));

	return (
		<header className="editor-toolbar">
			{/* `Pen.Toolbar.Root` provides the formatting state and arrow-key
			    navigation. It reads the block type options from the schema. */}
			<Pen.Toolbar.Root editor={editor}>
				<Pen.Toolbar.Select format="blockType" />
				<Pen.Toolbar.Separator />
				<Pen.Toolbar.Group>{markToggles}</Pen.Toolbar.Group>
			</Pen.Toolbar.Root>

			<div className="editor-toolbar-end">
				<IconButton
					label="Undo"
					keepsEditorFocus
					isDisabled={!undoState.canUndo}
					onClick={() => editor.undoManager.undo()}
				>
					<IconUndo />
				</IconButton>
				<IconButton
					label="Redo"
					keepsEditorFocus
					isDisabled={!undoState.canRedo}
					onClick={() => editor.undoManager.redo()}
				>
					<IconRedo />
				</IconButton>
				<IconButton
					label="Document state"
					isActive={isInspectorOpen}
					onClick={onToggleInspector}
				>
					<IconPanelRight />
				</IconButton>
			</div>
		</header>
	);
}

/**
 * `asChild` hands the primitive's behaviour to our own button so it can carry
 * the shared icon-button styles. Pressing it must not move DOM focus, or the
 * caret disappears while you format.
 */
function MarkToggle({
	format,
	label,
	children,
}: {
	format: string;
	label: string;
	children: ReactNode;
}) {
	return (
		<Pen.Toolbar.Toggle format={format} asChild>
			<button
				type="button"
				className="icon-button"
				title={label}
				aria-label={label}
				onMouseDown={(event) => event.preventDefault()}
			>
				{children}
			</button>
		</Pen.Toolbar.Toggle>
	);
}

function useUndoState(editor: Editor): { canUndo: boolean; canRedo: boolean } {
	const subscribe = useCallback(
		(onChange: () => void) => editor.undoManager.onStackChange(onChange),
		[editor],
	);

	const canUndo = useSyncExternalStore(subscribe, () =>
		editor.undoManager.canUndo(),
	);
	const canRedo = useSyncExternalStore(subscribe, () =>
		editor.undoManager.canRedo(),
	);

	return { canUndo, canRedo };
}
