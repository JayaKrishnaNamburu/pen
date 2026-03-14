import {
	Pen,
	type RendererOverrides,
} from "@pen/react";
import { aiExtension } from "@pen/ai";
import { createEditor, type Editor, type InteractionModel } from "@pen/core";
import { inputRulesExtension } from "@pen/input-rules";
import { databaseExtension, databaseRenderers } from "@pen/database";
import {
	RICH_TEXT_SHORTCUTS_EXTENSION_NAME,
	richTextShortcutsExtension,
} from "@pen/shortcuts";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import "./App.css";
import { PlaygroundBlockDragHandle } from "./components/BlockDragHandle";
import { PlaygroundImageRenderer } from "./components/ImageBlockRenderer";
import { PlaygroundChatDock } from "./components/PlaygroundChatDock";
import { PlaygroundEditorViewport } from "./components/PlaygroundEditorViewport";
import { usePlaygroundAISession } from "./hooks/usePlaygroundAISession";
import { InspectorPanel } from "./components/InspectorPanel";
import { Toolbar } from "./components/Toolbar";
import { PLAYGROUND_ASSETS, PLAYGROUND_IMPORTERS } from "./constants/playground";
import { createPlaygroundAIModel } from "./utils/playgroundAI";
import { canOpenLinkEditor } from "./utils/linkMarks";

const PLAYGROUND_RENDERERS = {
	...databaseRenderers,
	image: PlaygroundImageRenderer,
} satisfies RendererOverrides;
const PLAYGROUND_BLOCK_DRAG_AND_DROP = { enabled: true } as const;
const PLAYGROUND_DOCUMENT_PROFILE = "structured" as const;
const PLAYGROUND_AI_CONTENT_FORMAT = {
	blockGeneration: "markdown",
	selectionRewrite: "text",
} as const;

export function App() {
	const editorRef = useRef<Editor | null>(null);
	const linkToggleRef = useRef<(() => void) | null>(null);
	const editor = usePlaygroundEditor(editorRef, linkToggleRef);
	usePlaygroundAISession(editor);
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);
	const [interactionModel, setInteractionModel] = useState<InteractionModel>("content-first");

	if (!editor) {
		return null;
	}

	const handleToggleInspector = () => {
		setIsInspectorOpen((value) => !value);
	};
	const handleToggleInteractionModel = () => {
		setInteractionModel((current) =>
			current === "content-first" ? "block-first" : "content-first",
		);
	};

	return (
		<Pen.Editor.Root
			editor={editor}
			importers={PLAYGROUND_IMPORTERS}
			assets={PLAYGROUND_ASSETS}
			renderers={PLAYGROUND_RENDERERS}
			blockControls={PlaygroundBlockDragHandle}
			blockDragAndDrop={PLAYGROUND_BLOCK_DRAG_AND_DROP}
			interactionModel={interactionModel}
		>
			<Pen.AI.Root editor={editor}>
				<div className="playground-shell">
					<div className="playground-editor-column">
						<Toolbar
							editor={editor}
							linkToggleRef={linkToggleRef}
							interactionModel={interactionModel}
							onToggleInteractionModel={handleToggleInteractionModel}
						/>
						<PlaygroundEditorViewport editor={editor} />
					</div>
					<div className="playground-side-panel">
						<PlaygroundChatDock editor={editor} />
					</div>
					<InspectorPanel
						editor={editor}
						isOpen={isInspectorOpen}
						onToggle={handleToggleInspector}
					/>
				</div>
			</Pen.AI.Root>
		</Pen.Editor.Root>
	);
}

function usePlaygroundEditor(
	editorRef: MutableRefObject<Editor | null>,
	linkToggleRef: MutableRefObject<(() => void) | null>,
): Editor | null {
	const [editor, setEditor] = useState<Editor | null>(null);
	useEffect(() => {
		const nextEditor = createPlaygroundEditor(linkToggleRef, editorRef);
		editorRef.current = nextEditor;
		setEditor(nextEditor);

		return () => {
			if (editorRef.current === nextEditor) {
				editorRef.current = null;
			}
			nextEditor.destroy();
		};
	}, [editorRef, linkToggleRef]);

	return editor;
}

function createPlaygroundEditor(
	linkToggleRef: MutableRefObject<(() => void) | null>,
	editorRef: MutableRefObject<Editor | null>,
): Editor {
	const model = createPlaygroundAIModel(() => editorRef.current);
	return createEditor({
		documentProfile: PLAYGROUND_DOCUMENT_PROFILE,
		without: [RICH_TEXT_SHORTCUTS_EXTENSION_NAME],
		extensions: [
			aiExtension({
				model,
				contentFormat: PLAYGROUND_AI_CONTENT_FORMAT,
			}),
			inputRulesExtension(),
			databaseExtension(),
			richTextShortcutsExtension({
				onToggleLink: (ed) => {
					if (!canOpenLinkEditor(ed)) return false;
					linkToggleRef.current?.();
					return true;
				},
			}),
		],
	});
}
