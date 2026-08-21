import {
	MESSAGE_CATALOG_ROWS,
	MESSAGE_CATALOG_SOURCE,
	type MessageCatalogRow,
} from "../generated/messageCatalog";

function messageGroupSections() {
	const groups = new Map<string, MessageCatalogRow[]>();
	for (const row of MESSAGE_CATALOG_ROWS) {
		const list = groups.get(row.group);
		if (list) {
			list.push(row);
		} else {
			groups.set(row.group, [row]);
		}
	}
	return [...groups.entries()].map(([group, rows]) => {
		const tableRows = rows.map((row) => (
			<tr key={row.key}>
				<td>
					<code>{row.key}</code>
				</td>
				<td>{row.defaultEnglish}</td>
				<td>
					{row.params.length > 0
						? row.params.map((name) => `{${name}}`).join(", ")
						: "—"}
				</td>
			</tr>
		));
		return (
			<section key={group}>
				<h3>
					<code>{group}</code>
				</h3>
				<table>
					<caption>
						{rows.length} key{rows.length === 1 ? "" : "s"}
					</caption>
					<thead>
						<tr>
							<th>Key</th>
							<th>Default English</th>
							<th>Parameters</th>
						</tr>
					</thead>
					<tbody>{tableRows}</tbody>
				</table>
			</section>
		);
	});
}

export function LocalizationPage() {
	const catalogSections = messageGroupSections();
	return (
		<>
			<h1>Localization</h1>
			<p>
				Pen is translatable. It does not load translation files,
				negotiate locales, or depend on an i18n framework. Docs stay
				in English. Hosts pass a catalog. The product rule is{" "}
				<code>spec-v2/16-localization.md</code>.
			</p>

			<h2>Locale and messages</h2>
			<p>
				<code>createEditor</code> accepts <code>locale</code> (a BCP
				47 tag) and <code>messages</code> (
				<code>Partial&lt;MessageCatalog&gt;</code>). Those feed{" "}
				<code>pen.locale</code> and <code>pen.messages</code>. The
				English default catalog is{" "}
				<code>DEFAULT_MESSAGE_CATALOG</code> on{" "}
				<code>@input/pen-types</code>.
			</p>
			<pre>
				<code>{`import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
  locale: "de",
  a11yLabel: "Dokument",
  messages: {
    "pen.ai.review.accept": "Annehmen",
  },
});`}</code>
			</pre>
			<p>
				Keys are stable API, namespaced by owner (
				<code>pen.selection.blocksSelected</code>,{" "}
				<code>pen.ai.review.accept</code>, <code>pen.a11y.*</code>).
				Renaming a key is breaking; adding one is not. A missing key
				falls back to the default catalog, emits{" "}
				<code>message-missing</code> once, and never renders the raw
				key.
			</p>
			<p>
				Resolution is <code>resolveEditorMessage</code> in{" "}
				<code>@input/pen-core</code>: a key and typed parameters in,
				a string out. Counted strings use CLDR plural categories
				through <code>Intl.PluralRules</code> and the editor locale.
			</p>

			<h2>Default catalog</h2>
			<p>
				The table below is generated from{" "}
				<code>DEFAULT_MESSAGE_CATALOG</code> in{" "}
				<code>{MESSAGE_CATALOG_SOURCE}</code>. Hosts override by key.
				A check in the docs build fails when this page no longer
				matches that catalog.
			</p>
			<p>
				<code>createPseudoLocaleCatalog</code> is a test helper. It
				is not a shipping locale.
			</p>
			{catalogSections}

			<h2>Segmentation</h2>
			<p>
				Grapheme and word boundaries go through helpers on{" "}
				<code>@input/pen-core</code>:{" "}
				<code>nextGraphemeBoundary</code>,{" "}
				<code>nextWordBoundary</code>, and siblings. Those use{" "}
				<code>Intl.Segmenter</code> when present. Firefox below 125
				falls back: word operations use whitespace boundaries;
				character operations use code points, never code units.
			</p>
		</>
	);
}
