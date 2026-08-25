import type { Editor } from "@input/pen-types";
import { Sheet } from "../ui/Sheet";
import { BlockTree } from "./BlockTree";
import { useDocumentSnapshot } from "./useDocumentSnapshot";

interface InspectorSheetProps {
	editor: Editor;
	isOpen: boolean;
	onClose: () => void;
}

/**
 * The right-hand panel: what the document actually contains.
 *
 * Every value here is read back out of the editor, so it is the ground truth
 * rather than a mirror the app maintains. Type in the editor with this open and
 * watch the revision counter and block text move.
 */
export function InspectorSheet({ editor, isOpen, onClose }: InspectorSheetProps) {
	const snapshot = useDocumentSnapshot(editor, isOpen);

	return (
		<Sheet title="Document state" isOpen={isOpen} onClose={onClose}>
			<dl className="inspector-summary">
				<dt>Blocks</dt>
				<dd>{snapshot.blockCount}</dd>
				<dt>Revision</dt>
				<dd>{snapshot.generation}</dd>
				<dt>Selection</dt>
				<dd>{snapshot.selection}</dd>
			</dl>

			<section className="inspector-section">
				<h3 className="inspector-heading">Blocks</h3>
				<BlockTree blocks={snapshot.blocks} />
			</section>

			<details className="inspector-raw">
				<summary>Raw JSON</summary>
				<pre>{JSON.stringify(snapshot.blocks, null, 2)}</pre>
			</details>
		</Sheet>
	);
}
