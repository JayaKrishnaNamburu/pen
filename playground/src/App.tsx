import {
	Pen,
	type RendererOverrides,
	useEditor,
} from "@pen/react";
import { inputRulesExtension } from "@pen/input-rules";
import { databaseExtension, databaseRenderers } from "@pen/database";
import {
	RICH_TEXT_SHORTCUTS_EXTENSION_NAME,
	richTextShortcutsExtension,
} from "@pen/shortcuts";
import { useRef, useState } from "react";
import "./App.css";
import { PlaygroundImageRenderer } from "./components/ImageBlockRenderer";
import { InspectorPanel } from "./components/InspectorPanel";
import { SelectionToolbar } from "./components/SelectionToolbar";
import { SlashMenu } from "./components/SlashMenu";
import { Toolbar } from "./components/Toolbar";
import { PLAYGROUND_ASSETS, PLAYGROUND_IMPORTERS } from "./constants/playground";
import { canOpenLinkEditor } from "./utils/linkMarks";

const PLAYGROUND_RENDERERS = {
	...databaseRenderers,
	image: PlaygroundImageRenderer,
} satisfies RendererOverrides;

export function App() {
	const linkToggleRef = useRef<(() => void) | null>(null);
	const editor = useEditor({
		without: [RICH_TEXT_SHORTCUTS_EXTENSION_NAME],
		extensions: [
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
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);
	const handleToggleInspector = () => {
		setIsInspectorOpen((value) => !value);
	};

	return (
		<div className="playground">
			<div className="playground-body">
				<Pen.Editor.Root
					editor={editor}
					importers={PLAYGROUND_IMPORTERS}
					assets={PLAYGROUND_ASSETS}
					renderers={PLAYGROUND_RENDERERS}
				>
					<Toolbar editor={editor} linkToggleRef={linkToggleRef} />

					<div className="playground-editor">
						<Pen.Editor.Content
							emptyPlaceholder="Start writing, or press / for commands..."
						/>
						<Pen.Editor.RegionSelector />
						<Pen.Editor.SelectionRect />
						<SlashMenu editor={editor} />
						<SelectionToolbar />
					</div>
				</Pen.Editor.Root>
			</div>

			<InspectorPanel
				editor={editor}
				isOpen={isInspectorOpen}
				onToggle={handleToggleInspector}
			/>
		</div>
	);
}
