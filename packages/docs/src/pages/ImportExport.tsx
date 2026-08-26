import {
	EXPORT_FIDELITY_TABLES,
	type ExportFidelityTable,
} from "../generated/exportFidelity";
import {
	INGEST_BOUND_ROWS,
	INGEST_BOUND_SOURCES,
	type IngestBoundRow,
} from "../generated/ingestBounds";
import {
	PASTE_CORPUS_ROWS,
	PASTE_CORPUS_SOURCE,
	type PasteCorpusRow,
} from "../generated/pasteCorpus";

function exportFidelitySections() {
	return EXPORT_FIDELITY_TABLES.map((table: ExportFidelityTable) => {
		const tableRows = table.rows.map((row) => (
			<tr key={`${table.id}-${row.kind}-${row.type}`}>
				<td>{row.kind}</td>
				<td>
					<code>{row.type}</code>
				</td>
				<td>{row.fidelity}</td>
				<td>{row.notes.length > 0 ? row.notes : "—"}</td>
			</tr>
		));
		return (
			<section key={table.id}>
				<h3>{table.title}</h3>
				<p>{table.intro}</p>
				<table>
					<caption>
						{table.rows.length} rows from{" "}
						<code>{table.source}</code>. Generated; the docs build
						fails if this table drifts from that file.
					</caption>
					<thead>
						<tr>
							<th>Kind</th>
							<th>Type</th>
							<th>Fidelity</th>
							<th>Notes</th>
						</tr>
					</thead>
					<tbody>{tableRows}</tbody>
				</table>
			</section>
		);
	});
}

function missingCaptureItems() {
	return PASTE_CORPUS_ROWS.filter((row) => !row.captured).map((row) => (
		<li key={row.id}>
			<code>{row.id}</code> — {row.source}
			{row.id === "article" ? " (capture from Safari)" : ""}
		</li>
	));
}

function ingestBoundRows() {
	return INGEST_BOUND_ROWS.map((row: IngestBoundRow) => (
		<tr key={row.name}>
			<td>
				<code>{row.name}</code>
			</td>
			<td>{row.formattedValue}</td>
			<td>
				{row.enforcement === "advisory" ? (
					<>
						<strong>Advisory.</strong>{" "}
					</>
				) : null}
				{row.caps}
			</td>
		</tr>
	));
}

function pasteCorpusSections() {
	return PASTE_CORPUS_ROWS.map((row: PasteCorpusRow) => {
		const losses = row.intentionalLosses.map((loss) => (
			<li key={loss}>{loss}</li>
		));
		const captureNote = row.captured
			? `Captured from ${row.application} ${row.version} on ${row.capturedAt}${row.host ? ` (${row.host})` : ""}.`
			: row.approximates;
		return (
			<section key={row.id}>
				<h3>{row.source}</h3>
				<p>
					<code>{row.id}</code>. Provenance:{" "}
					<code>{row.provenance}</code>. {captureNote}
				</p>
				<table>
					<thead>
						<tr>
							<th>Headings</th>
							<th>Lists</th>
							<th>Tables</th>
							<th>Code</th>
							<th>Links</th>
							<th>Images</th>
							<th>Marks</th>
							<th>Colors</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>{row.headings}</td>
							<td>{row.lists}</td>
							<td>{row.tables}</td>
							<td>{row.code}</td>
							<td>{row.links}</td>
							<td>{row.images}</td>
							<td>{row.marks}</td>
							<td>{row.colors}</td>
						</tr>
					</tbody>
				</table>
				<p>Intentional losses:</p>
				<ul>{losses}</ul>
			</section>
		);
	});
}

export function ImportExportPage() {
	const fidelitySections = exportFidelitySections();
	const corpusSections = pasteCorpusSections();
	const missingCaptures = missingCaptureItems();
	const boundRows = ingestBoundRows();
	const boundSources = INGEST_BOUND_SOURCES.join(", ");
	return (
		<>
			<h1>Import and export</h1>
			<p>
				Importers turn foreign markup or JSON into document ops.
				Exporters walk the live document, including nested and layout
				children. HTML import sanitizes untrusted markup through{" "}
				<code>sanitizeHTML</code> (DOMPurify). That call runs on two
				ingresses only: paste <code>text/html</code> and the HTML import
				API. Pen-blocks JSON, plain-text paste, the Markdown / JSON /
				XML import APIs, drag-and-drop, AI writes, remote Y updates,
				assets, and the host&apos;s initial document do not pass the
				sanitizer. Render-time URL policy is the load-bearing defense
				for stored URLs. See <a href="#/security">Security</a>.
			</p>

			<h2>Packages</h2>
			<p>
				Install <code>@input/pen-interop</code>. Each format is a
				subpath that exports that format&apos;s importer and/or
				exporter.
			</p>
			<ul>
				<li>
					<code>@input/pen-interop/html</code> —{" "}
					<code>htmlImporter</code>, <code>sanitizeHTML</code>,{" "}
					<code>parseHtmlToBlocks</code>,{" "}
					<code>parseHtmlWithReport</code>, <code>htmlExporter</code>
				</li>
				<li>
					<code>@input/pen-interop/markdown</code> —{" "}
					<code>markdownImporter</code>, <code>markdownExporter</code>
				</li>
				<li>
					<code>@input/pen-interop/json</code> —{" "}
					<code>jsonImporter</code>, <code>jsonExporter</code>,{" "}
					<code>textExporter</code>
				</li>
				<li>
					<code>@input/pen-interop/xml</code> —{" "}
					<code>xmlExporter</code>, <code>xmlImporter</code>
				</li>
			</ul>
			<p>
				JSON is the interchange format for schema-known document
				content. XML is a lossless interchange layer on that same model.
				HTML export is DOM-free and safe to run on the server. Markdown
				is GitHub-flavored Markdown plus Pen-specific constructs; it is
				a dialect, not portable CommonMark for every block.
			</p>

			<h2>Clipboard payload</h2>
			<p>
				Copy writes <code>text/plain</code>, <code>text/html</code>, and{" "}
				<code>application/x-pen-blocks+json</code>. The JSON flavor is a{" "}
				<code>PenClipboardPayload</code>: <code>version</code>{" "}
				(currently <code>PEN_CLIPBOARD_PAYLOAD_VERSION</code> = 1),{" "}
				<code>blockTypes</code>, and <code>blocks</code>. Readers still
				accept the pre-SEC4 MIME <code>application/x-pen-blocks</code>.
			</p>
			<p>
				A payload newer than this reader falls back to the HTML flavor
				and emits <code>clipboard-unknown-version</code>. The JSON
				flavor is not partially read. A payload with no{" "}
				<code>version</code> (or a raw block array) migrates as version
				0. Invalid JSON emits <code>clipboard-invalid-payload</code> and
				also falls back to HTML.
			</p>
			<p>
				A version-1 payload is then admitted against the receiving
				schema. Types absent from <code>schema.allBlocks()</code> are
				dropped with <code>import-dropped</code> /{" "}
				<code>unknown-block-type</code>. The envelope can still name
				those types in <code>blockTypes</code>; they do not land in the
				document. Apply also refuses a new insert of a type that is not
				in <code>allBlocks()</code> (<code>PEN_APPLY_002</code>).
				Existing unknown content already stored is preserved on load
				(DUR3).
			</p>

			<h2>Paste fidelity</h2>
			<p>
				Foreign HTML paste goes through the generic HTML import path (
				<code>parseHtmlToBlocks</code>). Pen does not sniff{" "}
				<code>mso</code> classes or <code>docs-internal-guid</code>. A
				documented flattening is the paste contract; an undocumented one
				is a regression.
			</p>
			<p>
				The committed corpus is <strong>synthetic-until-capture</strong>
				. The fixtures under <code>{PASTE_CORPUS_SOURCE}</code> are
				documented approximations of what Word, Google Docs, Apple
				Notes, Notion, VS Code, a browser article, Excel/Sheets, and Pen
				emit. They are not hand-captured clipboard dumps from those
				applications. A real Word clipboard payload is hundreds of
				kilobytes of <code>&lt;style&gt;</code> and <code>mso-</code>{" "}
				attributes; these fixtures are a few hundred bytes. This page
				does not claim verified real-world paste fidelity.
			</p>
			<p>Sources still awaiting a real clipboard capture:</p>
			<ul>{missingCaptures}</ul>
			<p>
				The outcomes below are generated from each fixture&apos;s{" "}
				<code>expectation.json</code>. The same table is committed as{" "}
				<code>packages/extensions/interop/PASTE-CORPUS.md</code>. The
				harness already consumes a capture: overwrite{" "}
				<code>clipboard.html</code> / <code>plain.txt</code>, set{" "}
				<code>provenance.kind</code> to <code>captured</code> with
				application, version, and date, then update the stated
				structure. The procedure is{" "}
				<code>{PASTE_CORPUS_SOURCE}/CAPTURE.md</code>. The movement
				between synthetic expectation and real capture is the finding
				the corpus exists to surface. Do not invent markup and label it
				captured.
			</p>
			{corpusSections}

			<h2>Export fidelity</h2>
			<p>
				Each exporter publishes a fidelity table classifying every
				default block, mark, and inline node as <code>full</code>,{" "}
				<code>degraded</code>, or <code>dropped</code>. The tables below
				are generated from the <code>fidelityTable.ts</code> next to
				each exporter — the same source the IOP3 tests assert against{" "}
				<code>@input/pen-interop</code>&apos;s <code>FIDELITY.md</code>.
			</p>
			<p>
				JSON is lossless for schema-known content (blocks, props, marks,
				inline nodes, structured table payloads). Unknown props are
				preserved (DUR3). Metadata is included when requested. Apps are
				not part of that exporter. <code>subdocument</code> is degraded:{" "}
				<code>subdocumentGuid</code> is reassigned on import. XML is
				lossless on the same model, including subdocument. HTML and
				Markdown lose what their rows say they lose. A block without a
				serializer falls back to escaped text rather than throwing.
			</p>
			{fidelitySections}

			<h2>Headless export</h2>
			<p>
				Construct a headless editor from the host&apos;s persisted copy,
				export, and destroy. That is a read of the host&apos;s bytes,
				not a server CRDT. The same pattern is on the{" "}
				<a href="#/ssr">SSR</a> page.
			</p>
			<pre>
				<code>{`import { createHeadlessEditor } from "@input/pen-core";
import { htmlExporter } from "@input/pen-interop/html";
import { createDefaultSchema } from "@input/pen-schema-default";
import type { CRDTDocument } from "@input/pen-types";

function renderHtml(hostDocument: CRDTDocument) {
  const editor = createHeadlessEditor({
    document: hostDocument,
    schema: createDefaultSchema(),
  });
  const html = htmlExporter.export(editor);
  void editor.destroy();
  return html;
}`}</code>
			</pre>

			<h2>Ingest bounds</h2>
			<p>
				HTML, Markdown, JSON, XML, and clipboard-JSON ingest share one
				envelope. Each importer keeps a local copy of the constants
				(they are not a shared package). Clipboard JSON paste uses the
				same numbers under <code>CLIPBOARD_INGEST_*</code> aliases. The
				table is generated from <code>{boundSources}</code>; the docs
				build fails if those files disagree.
			</p>
			<table>
				<caption>
					Exceeding a hard bound on the block tree truncates at a
					block boundary. The content that fit is inserted. An
					oversize XML <em>source</em> is refused before parse — XML
					cannot slice to a valid document.{" "}
					<code>import-truncated</code> names the bound when a cap was
					hit; <code>import-dropped</code> covers other drops. One
					report per operation, not one diagnostic per block.{" "}
					<code>INGEST_TIME_BUDGET_MS</code> is advisory: the unit
					suite does not measure wall-clock time.
				</caption>
				<thead>
					<tr>
						<th>Constant</th>
						<th>Value</th>
						<th>What it caps</th>
					</tr>
				</thead>
				<tbody>{boundRows}</tbody>
			</table>
			<p>
				<code>__proto__</code>, <code>constructor</code>, and{" "}
				<code>prototype</code> are rejected as own keys. Unknown block
				types on a new write are dropped with{" "}
				<code>import-dropped</code>. The bounds are not configurable on
				the importer options.
			</p>

			<h2>Asset provider</h2>
			<p>
				<code>AssetProvider</code> is the host store for binary
				attachments. It lives in <code>@input/pen-types</code> and is
				installed on the editor as <code>assetProviderFacet</code> (
				<code>pen.assetProvider</code>). React and Vue{" "}
				<code>PenEditor</code> accept an <code>assets</code> prop and
				write it to the deprecated <code>paste:assetProvider</code>{" "}
				slot, which maps to that same facet.{" "}
				<code>CreateEditorOptions.assets</code> exists on the options
				type; <code>createEditor</code> does not read it.
			</p>
			<p>
				<code>@input/pen-assets-memory</code>{" "}
				<code>memoryAssets()</code> is a test double, not a production
				store. Pen does not ship a CDN, presigned upload, or
				image-processing implementation.
			</p>

			<h3>What Pen calls</h3>
			<ul>
				<li>
					<code>upload</code> and <code>resolve</code> — image file
					paste and drop in <code>@input/pen-dom</code>, and HTML
					import when <code>imageSrc</code> is{" "}
					<code>&quot;ingest&quot;</code>.
				</li>
				<li>
					<code>maxSize</code> — read on both of those paths before{" "}
					<code>upload</code>. The same limit is forwarded as{" "}
					<code>AssetUploadOptions.maxSize</code>. An oversize file
					emits <code>asset-upload-failed</code> naming the limit and
					the actual size. No image block is inserted for that file.
					Other files in the same batch that succeed still insert
					(partial insert).
				</li>
				<li>
					<code>onProgress</code> — forwarded to <code>upload</code>{" "}
					on the DOM image-file transfer path when a caller supplies
					the callback. HTML ingest does not pass{" "}
					<code>onProgress</code> and never did. That path fetches or
					decodes the image, then uploads the finished{" "}
					<code>File</code>; there is no incremental progress to
					report, so it does not invent a callback.
				</li>
			</ul>
			<p>
				HTML <code>&lt;img src&gt;</code> defaults to{" "}
				<code>imageSrc: &quot;keep&quot;</code>: remote URLs stay as
				remote references. The imported document may then depend on
				somebody else&apos;s server. Set{" "}
				<code>imageSrc: &quot;ingest&quot;</code> to fetch{" "}
				<code>http(s)</code> and <code>data:</code> URLs and upload them
				through the provider. Failed ingest emits{" "}
				<code>asset-upload-failed</code> and omits that image block.
			</p>

			<h3>What Pen never calls</h3>
			<p>
				<code>AssetProvider.delete</code> is host-implemented. Pen never
				calls it. Pen cannot know whether a removed block&apos;s asset
				is still referenced by another document, a version snapshot, or
				a collaborator&apos;s pending undo. There is no unused-asset
				garbage collector and no API that enumerates assets for you.
				Hosts that need a count walk image blocks and read{" "}
				<code>props.src</code> themselves.
			</p>
			<p>
				If the host never counts and never deletes, uploaded blobs
				accumulate in storage for the life of the deployment. If the
				host deletes on the first block removal, the other document, the
				snapshot, or the undo stack that still points at that URL goes
				blank. Call <code>delete</code> only when this host&apos;s count
				reaches zero.
			</p>
			<pre>
				<code>{`import {
  assetProviderFacet,
  createEditor,
  defineExtension,
} from "@input/pen-core";
import { htmlImporter } from "@input/pen-interop/html";
import { defaultPreset } from "@input/pen-preset-default";
import type {
  AssetProvider,
  AssetRef,
  AssetUploadOptions,
} from "@input/pen-types";

async function uploadToHost(
  file: File | Blob,
  options?: AssetUploadOptions,
): Promise<AssetRef> {
  options?.onProgress?.(0);
  const ref: AssetRef = {
    id: "asset-1",
    url: "https://cdn.example.com/asset-1",
    mimeType: options?.mimeType ?? "application/octet-stream",
    size: file.size,
  };
  options?.onProgress?.(1);
  return ref;
}

const assets: AssetProvider = {
  maxSize: 2_000_000,
  upload: uploadToHost,
  resolve(ref) {
    return ref.url;
  },
  async delete(_ref) {
    // host-owned: call only when this host's reference count hits zero
  },
};

const editor = createEditor({
  preset: defaultPreset(),
  extensions: [
    defineExtension({
      name: "host-assets",
      facets: [assetProviderFacet.of(assets)],
    }),
  ],
});

void htmlImporter.import('<img src="https://cdn.example.com/a.png" />', editor, {
  imageSrc: "ingest",
});`}</code>
			</pre>
			<p>
				On a mounted React or Vue editor, pass the same{" "}
				<code>assets</code> object as the <code>assets</code> prop. That
				is what paste and drop of image files read. The sample above is
				the path HTML ingest uses when there is no renderer.
			</p>
		</>
	);
}
