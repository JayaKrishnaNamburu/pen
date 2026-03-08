import "./InspectorPanel.css";
import type { Editor } from "@pen/core";
import { useEditorInspector } from "../hooks/useEditorInspector";

type InspectorPanelProps = {
	editor: Editor;
};

export function InspectorPanel({ editor }: InspectorPanelProps) {
	const inspectorJson = useEditorInspector(editor);

	return (
		<div className="playground-inspector">
			<header className="inspector-header">
				<h4 className="inspector-title">Document</h4>
			</header>

			<div className="inspector">
				<pre className="inspector-json">{inspectorJson}</pre>
			</div>
		</div>
	);
}
