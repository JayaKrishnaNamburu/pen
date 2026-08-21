export function UpgradePage() {
	return (
		<>
			<h1>Upgrade guides</h1>
			<p>
				There is no adopter-facing <code>MIGRATION.md</code> at the
				repository root yet. Wave 7 assembles that file from
				per-wave notes. The current assembly stub is{" "}
				<code>spec-v2/MIGRATION.md</code>. It is an engineering
				record, not a 2.0 cut, and it marks each item landed or
				not-yet.
			</p>

			<h2>Support</h2>
			<p>
				Security fixes land on the latest v2 minor only. Until 2.0
				is published, reports against the current development line
				on the default branch are accepted there. Deprecated v1
				adapters that can be expressed on v2 primitives are kept
				for exactly one minor of the v2 train, then removed.
			</p>
			<p>
				How to report a vulnerability is in{" "}
				<code>SECURITY.md</code>. See also{" "}
				<a href="#/security">Security for embedders</a>.
			</p>

			<h2>Landed host-visible breaks</h2>
			<ul>
				<li>
					<code>createEditor()</code> /{" "}
					<code>createHeadlessEditor()</code> no longer install the
					default schema. Pass <code>preset: defaultPreset()</code>{" "}
					or <code>schema: createDefaultSchema()</code>. React and
					Vue <code>useEditor</code> still default the schema.
				</li>
				<li>
					Subscribe to document effect with{" "}
					<code>{`editor.on("commit", handler)`}</code>.{" "}
					<code>change</code> and <code>documentCommit</code> remain
					for this minor and warn <code>event-deprecated</code>.
				</li>
				<li>
					<code>getSlot</code> / <code>setSlot</code> are deprecated
					adapters (<code>slot-deprecated</code>). Prefer{" "}
					<code>editor.facet(...)</code> and{" "}
					<code>extension.facets</code>.
				</li>
				<li>
					<code>toZod</code> is deleted. Do not import it.
				</li>
				<li>
					<code>yjs</code> and <code>y-protocols</code> are peers of{" "}
					<code>@input/pen-crdt-yjs</code>, not bundled.
				</li>
			</ul>
			<p>
				Command dispatch, the v2 selection-authority rewrite, and
				keymap-as-only-channel are specified and not host-exported
				yet. Do not migrate to those names until they appear on the
				package index. Per-package changelogs and git tags are not
				in this repository today.
			</p>
		</>
	);
}
