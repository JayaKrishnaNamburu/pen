export function UpgradePage() {
	return (
		<>
			<h1>Upgrade guides</h1>
			<p>
				There is no adopter-facing <code>MIGRATION.md</code> at the
				repository root yet. Wave 7 assembles that file from per-wave
				notes. The current assembly stub is{" "}
				<code>spec/MIGRATION.md</code>. It is an engineering record,
				not a 2.0 cut, and it marks each item landed or not-yet.
			</p>

			<h2>Support</h2>
			<p>
				Security fixes land on the latest v2 minor only. Until 2.0 is
				published, reports against the current development line on the
				default branch are accepted there. Deprecated v1 adapters that
				can be expressed on v2 primitives are kept for exactly one minor
				of the v2 train, then removed.
			</p>
			<p>
				How to report a vulnerability is in <code>SECURITY.md</code>.
				See also <a href="#/security">Security for embedders</a>.
			</p>

			<h2>Landed host-visible breaks</h2>
			<ul>
				<li>
					<code>createEditor()</code> /{" "}
					<code>createHeadlessEditor()</code> no longer install the
					default schema, nor document-ops, delta-stream, undo, or
					rich-text shortcuts. A bare editor has no Mod-B / Mod-I /
					Mod-Z. <code>aiExtension()</code> throws for the missing
					dependencies. Pass <code>preset: defaultPreset()</code> or
					compose <code>schema: createDefaultSchema()</code> and an{" "}
					<code>extensions</code> list. React and Vue{" "}
					<code>useEditor</code> still default the schema and still do
					not install a preset.
				</li>
				<li>
					Subscribe to document effect with{" "}
					<code>{`editor.on("commit", handler)`}</code>.{" "}
					<code>change</code> and <code>documentCommit</code> no
					longer fire. They no longer warn{" "}
					<code>event-deprecated</code>. Read{" "}
					<code>event.summary</code> (for example{" "}
					<code>summary.affectedBlockIds</code>).
				</li>
				<li>
					<code>getSlot</code> / <code>setSlot</code> are deleted.
					They no longer emit <code>slot-deprecated</code>. Read with{" "}
					<code>editor.facet(...)</code> and contribute through{" "}
					<code>extension.facets</code>. Production writes use{" "}
					<code>internals.assignSlot</code>.
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
				<code>getCommandRegistry</code> is exported from{" "}
				<code>@input/pen-core</code>. <code>Editor</code> has no{" "}
				<code>dispatch</code> or <code>canDispatch</code> method. The{" "}
				<code>Extension.keyBindings</code> array is deleted; host
				bindings are <code>keymapFacet</code> providers on{" "}
				<code>extension.facets</code>. They are handlers, not command
				tokens. The v2 selection-authority rewrite (
				<code>SelectionAuthority</code>, affinity on the live selection)
				is specified and not on the package index. Do not migrate to
				those names until they appear there. Per-package changelogs and
				git tags are not in this repository today. There has never been
				a release train. <code>pnpm add @input/pen-*</code> 404s.
			</p>
		</>
	);
}
