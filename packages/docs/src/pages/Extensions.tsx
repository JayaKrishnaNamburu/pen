export function ExtensionsPage() {
	return (
		<>
			<h1>Extensions and facets</h1>
			<p>
				Extensions add behavior. They do not replace{" "}
				<code>editor.apply</code>. Register them on{" "}
				<code>createEditor({"{ extensions }"})</code> or through a
				preset. <code>defaultPreset()</code> installs document-ops,
				delta-stream, undo, shortcuts, and{" "}
				<code>createDefaultSchema()</code> unless those options are
				turned off. Facet rules live in{" "}
				<code>spec/rules/facets.md</code>.
			</p>

			<h2>Facets</h2>
			<p>
				A facet is a typed &quot;many contribute, one consumes&quot;
				seam. <code>defineFacet</code> and{" "}
				<code>createFacetRegistry</code> export from{" "}
				<code>@input/pen-core</code>. Facet contracts live in{" "}
				<code>@input/pen-types</code>. Read a resolved value with{" "}
				<code>editor.facet(facet)</code>.
			</p>
			<p>
				Providers take a precedence: <code>highest</code>,{" "}
				<code>high</code>, <code>default</code>, <code>low</code>,{" "}
				<code>lowest</code>, then registration order. Extensions
				contribute through <code>extension.facets</code>.
			</p>
			<p>Core exports these named facets:</p>
			<ul>
				<li>
					<code>keymapFacet</code> (<code>pen.keymap</code>)
				</li>
				<li>
					<code>beforeApplyFacet</code> (<code>pen.beforeApply</code>)
				</li>
				<li>
					<code>decorationsFacet</code> (<code>pen.decorations</code>)
				</li>
				<li>
					<code>inputRulesFacet</code> (<code>pen.inputRules</code>)
				</li>
				<li>
					<code>commandsFacet</code> (<code>pen.commands</code>)
				</li>
				<li>
					<code>ariaReadOnlyFacet</code> (<code>pen.ariaReadOnly</code>
					) — sets <code>aria-readonly</code> only. It does
					not decline typing, <code>editor.apply</code>, or
					the wire. The <code>readonly</code> prop on{" "}
					<code>EditorRoot</code>, <code>PenEditor</code>, or{" "}
					<code>mountEditor</code> is what declines local
					typing.
				</li>
				<li>
					<code>clipboardFacet</code> (<code>pen.clipboard</code>)
				</li>
				<li>
					<code>assetProviderFacet</code> (
					<code>pen.assetProvider</code>)
				</li>
				<li>
					<code>urlPolicyFacet</code> (<code>pen.urlPolicy</code>)
				</li>
				<li>
					<code>localeFacet</code> / <code>messagesFacet</code>
				</li>
				<li>
					<code>a11yLabelFacet</code> (<code>pen.a11yLabel</code>)
				</li>
				<li>
					<code>aiEgressFacet</code> (<code>pen.aiEgress</code>)
				</li>
			</ul>
			<p>
				Controller facets exist for search, history, multiplayer, and
				the AI family. Public accessors such as{" "}
				<code>getAIController</code> read those facets.
			</p>
			<pre>
				<code>{`import { createEditor, ariaReadOnlyFacet } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
});

const ariaReadOnly = editor.facet(ariaReadOnlyFacet);`}</code>
			</pre>
		</>
	);
}
