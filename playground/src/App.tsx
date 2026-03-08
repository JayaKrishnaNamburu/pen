import "./App.css";
import {
	RICH_TEXT_SHORTCUTS_EXTENSION_NAME,
	richTextShortcutsExtension,
} from "@pen/shortcuts";
import { Pen, useEditor } from "@pen/react";
import { useRef, useState } from "react";
import { InspectorPanel } from "./components/InspectorPanel";
import { SlashMenu } from "./components/SlashMenu";
import { Toolbar } from "./components/Toolbar";
import { PLAYGROUND_IMPORTERS } from "./constants/playground";
import { canOpenLinkEditor } from "./utils/linkMarks";
import {
	IconBold,
	IconCode,
	IconItalic,
	IconStrikethrough,
	IconUnderline,
} from "./components/icons";

export function App() {
	const linkToggleRef = useRef<(() => void) | null>(null);
	const editor = useEditor({
		without: [RICH_TEXT_SHORTCUTS_EXTENSION_NAME],
		extensions: [
			richTextShortcutsExtension({
				onToggleLink: (ed) => {
					if (!canOpenLinkEditor(ed)) return false;
					linkToggleRef.current?.();
					return true;
				},
			}),
		],
	});
	const [isInspectorOpen, setIsInspectorOpen] = useState(true);

	return (
		<div className="playground">
			<div className="playground-body">
				<Pen.Editor.Root editor={editor} importers={PLAYGROUND_IMPORTERS}>
					<Toolbar
						editor={editor}
						isInspectorOpen={isInspectorOpen}
						onToggleInspector={() => setIsInspectorOpen((value) => !value)}
						linkToggleRef={linkToggleRef}
					/>

					<div className="playground-editor">
						<Pen.Editor.Content />
						<SlashMenu />
						<Pen.SelectionToolbar.Root>
							<Pen.SelectionToolbar.Content>
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
								</Pen.Toolbar.Group>
							</Pen.SelectionToolbar.Content>
						</Pen.SelectionToolbar.Root>
					</div>
				</Pen.Editor.Root>
			</div>

			{isInspectorOpen ? <InspectorPanel editor={editor} /> : null}
		</div>
	);
}
