import { useState } from "react";
import type { Editor } from "@input/pen-types";
import { Sheet } from "../ui/Sheet";
import { tabId, Tabs } from "../ui/Tabs";
import { BlockTree } from "./BlockTree";
import { useDocumentSnapshot } from "./useDocumentSnapshot";

interface InspectorSheetProps {
	editor: Editor;
	open: boolean;
	onClose: () => void;
}

type InspectorView = "blocks" | "json";

const VIEWS = [
	{ value: "blocks", label: "Blocks" },
	{ value: "json", label: "JSON" },
] satisfies { value: InspectorView; label: string }[];

/**
 * The right-hand panel: what the document actually contains.
 *
 * Every value here is read back out of the editor, so it is the ground truth
 * rather than a mirror the app maintains. Type in the editor with this open and
 * watch the revision counter and block text move.
 */
export function InspectorSheet({ editor, open, onClose }: InspectorSheetProps) {
	const snapshot = useDocumentSnapshot(editor, open);
	const [view, setView] = useState<InspectorView>("blocks");

	return (
		<Sheet
			title="Document state"
			open={open}
			onClose={onClose}
			headerActions={
				<Tabs items={VIEWS} active={view} onChange={setView} />
			}
		>
			<dl className="inspector-summary">
				<dt>Blocks</dt>
				<dd>{snapshot.blockCount}</dd>
				<dt>Revision</dt>
				<dd>{snapshot.generation}</dd>
				<dt>Selection</dt>
				<dd>{snapshot.selection}</dd>
			</dl>

			<div
				className="inspector-view"
				role="tabpanel"
				aria-labelledby={tabId(view)}
			>
				{view === "blocks" ? (
					<BlockTree blocks={snapshot.blocks} />
				) : (
					<pre className="inspector-json">
						{JSON.stringify(snapshot.blocks, null, 2)}
					</pre>
				)}
			</div>
		</Sheet>
	);
}
