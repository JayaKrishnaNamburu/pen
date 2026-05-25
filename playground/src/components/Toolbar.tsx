import "./Toolbar.css";
import { Pen } from "@pen/react";
import type { Editor } from "@pen/types";
import type { RefObject } from "react";
import { PLAYGROUND_BLOCK_TYPE_ORDER } from "../constants/playground";
import type { PlaygroundCollaborationConfig } from "../utils/playgroundCollaboration";
import {
	IconBold,
	IconCode,
	IconItalic,
	IconRedo,
	IconStrikethrough,
	IconUnderline,
	IconUndo,
} from "./icons";
import { CollaborationStatus } from "./ToolbarCollaborationStatus";
import { ExportMenu } from "./ToolbarExportMenu";
import { LinkButton } from "./ToolbarLinkButton";
import { SearchMenu } from "./ToolbarSearchMenu";
import { preventEditorBlur } from "./ToolbarUtils";

type ToolbarProps = {
	editor: Editor;
	linkToggleRef: RefObject<(() => void) | null>;
	collaboration?: PlaygroundCollaborationConfig | null;
	interactionModel?: "content-first" | "block-first";
	onToggleInteractionModel?: () => void;
	onStartFreshRoom?: () => void;
};

export function Toolbar({
	editor,
	linkToggleRef,
	collaboration = null,
	interactionModel = "content-first",
	onToggleInteractionModel,
	onStartFreshRoom,
}: ToolbarProps) {
	const blockTypeOptions = getBlockTypeOptions(editor);
	const interactionModeLabel =
		interactionModel === "block-first" ? "Block-first" : "Content-first";

	const handleUndo = () => {
		editor.undoManager.undo();
	};

	const handleRedo = () => {
		editor.undoManager.redo();
	};

	return (
		<header className="toolbar" data-pen-ignore-pointer-gesture="">
			<div className="toolbar-left">
				<h4 className="toolbar-title">Pen</h4>
				{collaboration ? (
					<CollaborationStatus
						editor={editor}
						room={collaboration.room}
						userName={collaboration.user.name}
					/>
				) : null}
				{onToggleInteractionModel ? (
					<button
						className="toolbar-mode-toggle"
						data-active={
							interactionModel === "block-first" || undefined
						}
						onMouseDown={preventEditorBlur}
						onClick={onToggleInteractionModel}
						type="button"
						title={`Selection model: ${interactionModeLabel}`}
						aria-label={`Toggle selection model. Current mode: ${interactionModeLabel}`}
					>
						{interactionModeLabel}
					</button>
				) : null}
				{onStartFreshRoom ? (
					<button
						className="toolbar-mode-toggle"
						onMouseDown={preventEditorBlur}
						onClick={onStartFreshRoom}
						type="button"
						title="Open a clean collaboration room"
						aria-label="Open a fresh collaboration room"
					>
						Fresh room
					</button>
				) : null}
			</div>

			<div className="toolbar-right">
				<Pen.Toolbar.Root editor={editor}>
					<Pen.Toolbar.Select
						format="blockType"
						options={blockTypeOptions}
					/>

					<Pen.Toolbar.Separator />

					<Pen.Toolbar.Group>
						<Pen.Toolbar.Toggle format="bold">
							<IconBold className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="italic">
							<IconItalic className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="underline">
							<IconUnderline className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="strikethrough">
							<IconStrikethrough className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="code">
							<IconCode className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<LinkButton
							editor={editor}
							linkToggleRef={linkToggleRef}
						/>
					</Pen.Toolbar.Group>
				</Pen.Toolbar.Root>

				<Pen.Toolbar.Separator />

				<button
					className="toolbar-button toolbar-icon-button"
					onMouseDown={preventEditorBlur}
					onClick={handleUndo}
					type="button"
					title="Undo"
					aria-label="Undo"
				>
					<IconUndo size={12} className="toolbar-button-icon" />
				</button>
				<button
					className="toolbar-button toolbar-icon-button"
					onMouseDown={preventEditorBlur}
					onClick={handleRedo}
					type="button"
					title="Redo"
					aria-label="Redo"
				>
					<IconRedo size={12} className="toolbar-button-icon" />
				</button>

				<Pen.Toolbar.Separator />

				<SearchMenu editor={editor} />

				<Pen.Toolbar.Separator />

				<ExportMenu editor={editor} />
			</div>
		</header>
	);
}

function getBlockTypeOptions(editor: Editor) {
	const displayByType = new Map(
		editor.schema
			.allBlockDisplays()
			.map((schema) => [schema.type, schema.display.title] as const),
	);

	return PLAYGROUND_BLOCK_TYPE_ORDER.map((type) => ({
		value: type,
		label: displayByType.get(type) ?? type,
	}));
}
