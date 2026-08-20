export function HomePage() {
	return (
		<>
			<h1>Pen</h1>
			<p>
				Pen is a headless, extension-first, block-native rich text editor
				SDK. The core runtime owns document state, selection, normalization,
				and mutation through <code>editor.apply</code>. Renderer packages
				bind that runtime to React, Vue, or the DOM.
			</p>
			<p>
				It is source-available under a commercial license. Evaluate and
				develop with the published packages; production use needs a license
				from Input.
			</p>

			<h2>Getting started</h2>
			<p>
				Start with <code>@input/pen-preset-default</code> and a host binding.
				Minimal apps live in this repository at <code>examples/react</code>,{" "}
				<code>examples/vue</code>, and <code>examples/vanilla</code>. Each
				README has the install command including peer dependencies.
			</p>
			<p>
				Pen ships no required stylesheet — the editor is functional
				unstyled. Tokens live in the <code>@input/pen-react</code> STYLING.md
				property reference.
			</p>
			<p>
				<code>@input/pen-react</code> is a client module. In Next.js App
				Router, import the editor from a Client Component.{" "}
				<code>@input/pen-core</code> stays importable from server code.
			</p>

			<h2>Core ideas</h2>
			<ul>
				<li>
					Blocks are the document unit. Addressing is block-scoped:{" "}
					<code>{"{ blockId, offset }"}</code>.
				</li>
				<li>
					<code>DocumentOp[]</code> is the mutation currency.{" "}
					<code>editor.apply(ops, {"{ origin }"})</code> is the only durable
					write path.
				</li>
				<li>
					Origins label who wrote a change (<code>user</code>, <code>ai</code>,{" "}
					<code>collaborator</code>, and others). Undo, suggestions, and
					history depend on them.
				</li>
			</ul>

			<h2>On this site</h2>
			<ul>
				<li>
					<a href="#/collaboration">Collaboration</a> — what Pen guarantees
					when more than one client is on a document, and what the host owns
					(COL5).
				</li>
				<li>
					<a href="#/ssr">SSR</a> — shell-only server rendering, and how the
					host emits document HTML (HOST5).
				</li>
			</ul>
			<p>
				Package READMEs and the repository root README are the current
				signatures of record. This site links them rather than restating
				APIs.
			</p>
		</>
	);
}
