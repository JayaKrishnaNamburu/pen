export function HomePage() {
	return (
		<>
			<h1>Pen</h1>
			<p>
				Pen is a headless, extension-first, block-native rich text
				editor SDK. The core runtime owns document state, selection,
				normalization, and mutation through <code>editor.apply</code>.
				Renderer packages bind that runtime to React, Vue, or the DOM.
			</p>
			<p>
				It is licensed under the MIT License. License and distribution
				are stated in the repository root README. Packages are not on
				the public registry: there has never been a release train, a git
				tag, or a <code>CHANGELOG.md</code>.{" "}
				<code>pnpm add @input/pen-*</code> 404s today.
			</p>

			<h2>Getting started</h2>
			<p>
				Start with <code>@input/pen</code> and a host
				binding. Mount snippets for React, Vue, and vanilla live on{" "}
				<a href="#/getting-started">Getting started</a>. Minimal apps
				live in this repository at <code>examples/react</code>,{" "}
				<code>examples/vue</code>, and <code>examples/vanilla</code>.
			</p>
			<p>
				Pen ships no required stylesheet — the editor is functional
				unstyled. Tokens live in the <code>STYLING.md</code> that ships
				inside <code>@input/pen-react</code>.
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
					<code>editor.apply(ops, {"{ origin }"})</code> is the only
					durable write path.
				</li>
				<li>
					Origins label who wrote a change (<code>user</code>,{" "}
					<code>ai</code>, <code>collaborator</code>, and others).
					Undo, suggestions, and history depend on them.
				</li>
			</ul>

			<h2>On this site</h2>
			<ul>
				<li>
					<a href="#/getting-started">Getting started</a> — React,
					Vue, and vanilla mount paths
				</li>
				<li>
					<a href="#/core-concepts">Core concepts</a> — blocks, ops,{" "}
					<code>apply</code>, origins, commits
				</li>
				<li>
					<a href="#/selection">Selection</a> — block-scoped selection
					kinds and host writes
				</li>
				<li>
					<a href="#/extensions">Extensions and facets</a> — how
					extensions contribute, and which facets core exports
				</li>
				<li>
					<a href="#/commands">Commands and keymaps</a> — registry,
					dispatch, catalog, and keymaps
				</li>
				<li>
					<a href="#/collaboration">Collaboration</a> — CRDT
					convergence, origin labeling, and host-owned setup
				</li>
				<li>
					<a href="#/ai">AI features</a> — model adapter, transports,
					suggestions, autocomplete
				</li>
				<li>
					<a href="#/import-export">Import and export</a> — HTML,
					Markdown, JSON, XML, paste fidelity, and assets
				</li>
				<li>
					<a href="#/security">Security</a> — render-time URL policy
					and embedder boundaries
				</li>
				<li>
					<a href="#/accessibility">Accessibility</a> — surface label,
					announcements, WCAG 2.2 AA target
				</li>
				<li>
					<a href="#/support">Browser and Node</a> — HOST3 runtime
					floor
				</li>
				<li>
					<a href="#/localization">Localization</a> — locale, message
					catalog, segmentation
				</li>
				<li>
					<a href="#/upgrade">Upgrade guides</a> — support window and
					landed host-visible breaks
				</li>
				<li>
					<a href="#/ssr">SSR</a> — shell-only server rendering
					(HOST5)
				</li>
			</ul>
			<p>
				Each published package commits an <code>api-report.md</code>{" "}
				next to its source. Package READMEs and those reports are the
				current signatures of record. This site does not restate them
				and does not host a generated browsable reference.
			</p>
		</>
	);
}
