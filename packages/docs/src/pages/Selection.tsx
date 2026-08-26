export function SelectionPage() {
	return (
		<>
			<h1>Selection model</h1>
			<p>
				Addressing is block-scoped. A point is{" "}
				<code>{"{ blockId, offset }"}</code> in that block&apos;s text
				domain. The editor holds one selection at a time. Hosts read
				and write it through <code>@input/pen-core</code>, not by
				inferring caret position from the DOM.
			</p>

			<h2>Selection kinds</h2>
			<p>
				<code>SelectionState</code> in <code>@input/pen-types</code> is
				one of:
			</p>
			<ul>
				<li>
					<strong>text</strong> — <code>anchor</code> and{" "}
					<code>focus</code> points. Read collapsed / multi-block /
					span through <code>isCollapsed(sel)</code>,{" "}
					<code>isMultiBlock(sel)</code>,{" "}
					<code>getSelectionBlockRange(doc, sel)</code>, and{" "}
					<code>selectionToRange(doc, sel)</code> from{" "}
					<code>@input/pen-core</code>.
				</li>
				<li>
					<strong>block</strong> — <code>blockIds</code>.
				</li>
				<li>
					<strong>cell</strong> — a table range: <code>blockId</code>{" "}
					plus <code>anchor</code> / <code>head</code> row-column
					pairs.
				</li>
				<li>
					<strong>app</strong> — <code>appId</code>.
				</li>
				<li>
					<strong>null</strong> — no selection.
				</li>
			</ul>

			<h2>Host writes</h2>
			<p>
				<code>editor.setSelection</code> accepts a{" "}
				<code>SelectionState</code>. Helpers cover the common cases:{" "}
				<code>selectText</code>, <code>selectTextRange</code>,{" "}
				<code>selectBlock</code>, <code>selectBlocks</code>,{" "}
				<code>selectCell</code>, <code>selectCellRange</code>,{" "}
				<code>selectAll</code>. Read with <code>getSelection</code> or{" "}
				<code>editor.selection</code>.
			</p>
			<pre>
				<code>{`import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
});
const blockId = editor.firstBlock()?.id ?? "";

editor.selectText(blockId, 0, 5);
editor.selectBlock(blockId);

const selection = editor.getSelection();
if (selection?.type === "text") {
  editor.selectTextRange(selection.anchor, selection.focus);
}`}</code>
			</pre>

			<h2>DOM role</h2>
			<p>
				<code>@input/pen-dom</code> maps pointer and IME input into
				logical selection and projects the logical record into the
				field. The field is a sensor and a display. Overlay carets
				are presentation; they are not a second source of truth.
			</p>
			<p>
				A v2 rewrite of the authority, reader, and projector is
				specified in <code>spec/rules/selection.md</code>. The types
				and helpers above are what hosts call today. Affinity is
				specified for v2 and is not a field on today&apos;s{" "}
				<code>TextSelection</code>. Additive v2 selection types in
				the types package are not on that package&apos;s public
				index.
			</p>
		</>
	);
}
