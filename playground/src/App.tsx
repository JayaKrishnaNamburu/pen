import "./App.css";
import { Pen, useEditor } from "@pen/react";
import { useState } from "react";
import { InspectorPanel } from "./components/InspectorPanel";
import { SlashMenu } from "./components/SlashMenu";
import { Toolbar } from "./components/Toolbar";
import { PLAYGROUND_IMPORTERS } from "./constants/playground";

export function App() {
	const editor = useEditor();
	const [isInspectorOpen, setIsInspectorOpen] = useState(true);

	return (
		<div className="playground">
			<div className="playground-body">
				<Pen.Editor.Root editor={editor} importers={PLAYGROUND_IMPORTERS}>
					<Toolbar
						editor={editor}
						isInspectorOpen={isInspectorOpen}
						onToggleInspector={() => setIsInspectorOpen((value) => !value)}
					/>

					<div className="playground-editor">
						<Pen.Editor.Content />
						<SlashMenu />
					</div>
				</Pen.Editor.Root>
			</div>

			{isInspectorOpen ? <InspectorPanel editor={editor} /> : null}
		</div>
	);
}
