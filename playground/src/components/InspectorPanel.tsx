import "./InspectorPanel.css";
import type { Editor } from "@pen/core";
import { IconConsole } from "./icons";
import { useEditorInspector } from "../hooks/useEditorInspector";

type InspectorPanelProps = {
	editor: Editor;
	isOpen: boolean;
	onToggle: () => void;
};

export function InspectorPanel({
	editor,
	isOpen,
	onToggle,
}: InspectorPanelProps) {
	const inspectorJson = useEditorInspector(editor);

	return (
		<aside className="playground-inspector" data-open={isOpen || undefined}>
			<header className="inspector-header">
				<h4 className="inspector-title">Document</h4>
			</header>

			<div className="inspector">
				<pre className="inspector-json">{inspectorJson}</pre>
			</div>

			<div className="inspector-footer">
				<button
					className="inspector-toggle-button"
					type="button"
					onClick={onToggle}
					data-active={isOpen || undefined}
					title={isOpen ? "Hide document inspector" : "Show document inspector"}
					aria-label={isOpen ? "Hide document inspector" : "Show document inspector"}
				>
					<IconConsole className="inspector-toggle-icon" />
				</button>
			</div>
		</aside>
	);
}
