export function SSRPage() {
	return (
		<article>
			<h1>Server rendering</h1>
			<p>
				SSR is <strong>shell-only</strong>: the server renders the
				editor container and no document content. This is HOST5 in{" "}
				<code>spec/rules/host.md</code>. It is a decision, not a gap.
				Faithful SSR of a CRDT document would require that document on
				the server. Pen does not own that transport and does not run a
				server CRDT.
			</p>
			<p>
				Package-local copy:{" "}
				<code>packages/rendering/react/README.md</code> (Server
				rendering). Styling:{" "}
				<code>packages/rendering/react/STYLING.md</code>.
			</p>

			<h2>What the shell is</h2>
			<p>
				<code>PenEditor</code> hydrates an empty shell. The block-list
				and text-snapshot hooks return empty snapshots on the server on
				purpose. After hydration the client fills from the live
				document. Do not &quot;fix&quot; those snapshots to read the
				live document during SSR — that would couple the renderer to a
				server-side document Pen does not provide.
			</p>
			<p>
				Layout effects run through one{" "}
				<code>useIsomorphicLayoutEffect</code> seam in{" "}
				<code>@input/pen-react</code>. On the server the seam binds{" "}
				<code>useEffect</code> so React emits zero warnings. On the
				client it keeps layout timing. Hosts do not import the seam; it
				is an internal contract so a <code>renderToString</code> then{" "}
				<code>hydrateRoot</code> pass stays quiet for an empty and a
				non-empty document.
			</p>

			<h2>Indexed HTML from the host&apos;s copy</h2>
			<p>
				Hosts that need crawler-visible or statically indexed content
				render HTML from <strong>their own persisted copy</strong> with{" "}
				<code>@input/pen-interop/html</code>. The exporter is DOM-free
				and server-safe. Construct a headless editor from that copy,
				export, and destroy. That is a read of the host&apos;s bytes,
				not a server CRDT.
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
			<p>
				Render that string as ordinary HTML next to the editor shell.
				The editor stays a client island; the exported markup is the
				host&apos;s content surface. Do not expect{" "}
				<code>PenEditor</code> to emit this HTML on the server.
			</p>

			<h2>Hydration</h2>
			<p>
				A server render followed by client hydration of the same
				document produces no hydration mismatch for the shell. That
				holds for an empty document and a non-empty one: the server
				snapshot is empty either way, so the client markup matches the
				shell and then fills from the live document.
			</p>
			<p>
				Zero React warnings is the gate. Hosts read warnings as bugs
				regardless of who caused them. The isomorphic layout-effect seam
				exists so a server pass does not emit the{" "}
				<code>useLayoutEffect</code> warning.
			</p>

			<h2>What this is not</h2>
			<ul>
				<li>
					<strong>No SSR of document content</strong> through the
					React renderer. The shell is empty by contract.
				</li>
				<li>
					<strong>No server-side CRDT runtime.</strong> Pen does not
					host a Yjs provider, room, or collaborative document on the
					server for rendering.
				</li>
				<li>
					<strong>No required stylesheet.</strong> The editor is
					functional unstyled. Override tokens are listed in{" "}
					<code>packages/rendering/react/STYLING.md</code>.
				</li>
			</ul>
		</article>
	);
}
