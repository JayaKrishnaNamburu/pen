import {
	DIAGNOSTIC_CODE_ROWS,
	DIAGNOSTIC_CODE_SOURCE,
} from "../generated/diagnosticCodes";

function diagnosticTableRows() {
	return DIAGNOSTIC_CODE_ROWS.map((row) => (
		<tr key={row.code}>
			<td>
				<code>{row.code}</code>
			</td>
			<td>
				{row.levels.length > 0 ? row.levels.join(", ") : "—"}
			</td>
			<td>
				{row.sources.map((source) => (
					<div key={source}>
						<code>{source}</code>
					</div>
				))}
			</td>
		</tr>
	));
}

export function CoreConceptsPage() {
	const diagnosticRows = diagnosticTableRows();
	return (
		<>
			<h1>Core concepts</h1>
			<p>
				Pen is a headless editor runtime.{" "}
				<code>@input/pen-core</code> owns document state, selection,
				normalization, and mutation. Renderer packages bind that
				runtime to React, Vue, or the DOM. Core works without a
				browser through <code>createHeadlessEditor</code>. The
				architecture record is{" "}
				<code>spec-v2/01-architecture.md</code>.
			</p>

			<h2>Document store</h2>
			<p>
				The document is a Yjs <code>Y.Doc</code> with{" "}
				<code>blockOrder</code>, <code>blocks</code>, <code>apps</code>
				, and <code>metadata</code>. Blocks have stable string IDs.
				Inline content is <code>Y.Text</code> with attributes.
				Addressing is block-scoped: <code>{"{ blockId, offset }"}</code>
				. There is no document-wide token index.
			</p>

			<h2>Ops and apply</h2>
			<p>
				<code>DocumentOp[]</code> is the mutation currency.{" "}
				<code>editor.apply(ops, {"{ origin }"})</code> is the only
				durable write path. <code>editor.openTextStream</code> is sugar
				over the same pipeline. Do not write Yjs types from host or
				extension code.
			</p>
			<pre>
				<code>{`import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
});
const blockId = editor.firstBlock()?.id ?? "";

editor.apply(
  [
    {
      type: "insert-text",
      blockId,
      offset: 0,
      text: "Hello",
    },
  ],
  { origin: "user" },
);`}</code>
			</pre>
			<p>
				Op <code>type</code> strings use kebab-case (
				<code>insert-text</code>, <code>delete-text</code>,{" "}
				<code>insert-block</code>). Contracts live in{" "}
				<code>@input/pen-types</code>.
			</p>

			<h2>Origins</h2>
			<p>
				Every apply carries an origin. The type union includes{" "}
				<code>user</code>, <code>ai</code>, <code>collaborator</code>,{" "}
				<code>input-rule</code>, <code>history</code>,{" "}
				<code>import</code>, and others. A string origin or a
				structured object (<code>{"{ type, groupId, requestId }"}</code>
				) are both accepted on <code>apply</code>. The{" "}
				<code>commit</code> event always emits a structured origin
				(<code>{"{ type }"}</code>); a string passed in is wrapped.{" "}
				<code>{`origin === "user"`}</code> never matches the event.
				Undo, suggestions, and diagnostics depend on the label.{" "}
				<code>"user"</code> means this client&apos;s user. A remote
				update is not labeled <code>user</code> by default.
			</p>

			<h2>Commits</h2>
			<p>
				Each pipeline run emits one <code>commit</code> event with a{" "}
				<code>ChangeSummary</code>, the origin, and selection
				before/after. Subscribe with{" "}
				<code>{`editor.on("commit", handler)`}</code>.{" "}
				<code>change</code> and <code>documentCommit</code> still fire
				for this minor and emit <code>event-deprecated</code> once per
				session.
			</p>

			<h2>Diagnostics</h2>
			<p>
				Invalid input is dropped with{" "}
				<code>{`editor.on("diagnostic", handler)`}</code>, not thrown.
				<code>DiagnosticEvent.code</code> is a string. There is no
				frozen code union in <code>@input/pen-types</code> — codes
				are defined at emit sites.
			</p>
			<table>
				<caption>
					{DIAGNOSTIC_CODE_ROWS.length} codes from{" "}
					{DIAGNOSTIC_CODE_SOURCE}. Generated; the docs build
					fails if this table drifts from those sites.
				</caption>
				<thead>
					<tr>
						<th>Code</th>
						<th>Level</th>
						<th>Source</th>
					</tr>
				</thead>
				<tbody>{diagnosticRows}</tbody>
			</table>

			<h2>Headless vs host</h2>
			<p>
				<code>createEditor</code> and <code>createHeadlessEditor</code>{" "}
				are the constructors. Neither installs a schema or
				extensions. Without <code>preset: defaultPreset()</code>,{" "}
				<code>editor.undoManager</code> is an inert stub and Mod-Z
				does nothing. Headless construction and apply work in
				Node. Only <code>@input/pen-dom</code> may touch browser
				globals. React and Vue are bindings over that DOM engine.
			</p>
			<p>
				Each published package commits an <code>api-report.md</code>{" "}
				next to its source. This site does not host a generated
				browsable reference and does not restate those signatures.
			</p>
		</>
	);
}
