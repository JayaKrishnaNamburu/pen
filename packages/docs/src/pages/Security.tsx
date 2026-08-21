export function SecurityPage() {
	return (
		<>
			<h1>Security for embedders</h1>
			<p>
				Pen renders and mutates a collaborative document. Remote Yjs
				updates write shared state without passing through import
				sanitization. The load-bearing boundary is render and
				interaction time. The host owns who may write. The posture is{" "}
				<code>spec-v2/12-security.md</code>.
			</p>
			<p>
				Disclosure, supported versions, and the 90-day coordinated
				disclosure window are in the repository{" "}
				<code>SECURITY.md</code>. Prefer GitHub private vulnerability
				reporting. Fallback: email <code>support@input.so</code> with
				subject <code>Pen security</code>.
			</p>

			<h2>URL policy</h2>
			<p>
				One module admits URLs for everything the library renders.{" "}
				<code>urlPolicy</code>, <code>UrlPolicy</code>, and{" "}
				<code>UrlContext</code> export from <code>@input/pen-core</code>
				. <code>@input/pen-dom</code> re-exports them and also
				exports <code>urlPolicyExtension</code>.
			</p>
			<p>
				Default admission: <code>http:</code>, <code>https:</code>,{" "}
				<code>mailto:</code>, <code>tel:</code>, and relative URLs.
				<code>data:image/(png|jpeg|gif|webp|avif)</code> is allowed
				in image context only. <code>javascript:</code>,{" "}
				<code>vbscript:</code>, <code>file:</code>,{" "}
				<code>data:text/html</code>, and non-strings resolve to{" "}
				<code>null</code>. A blocked URL renders without the
				URL-bearing attribute and with{" "}
				<code>data-pen-blocked-url=&quot;&quot;</code>. The raw URL
				is not echoed.
			</p>
			<p>
				Hosts that need extra schemes wrap the default policy with{" "}
				<code>urlPolicyExtension</code>. That wrap is{" "}
				<code>pen.urlPolicy</code>: render-time sinks and clipboard
				HTML read the editor facet. HTML and XML exporters call the
				default <code>urlPolicy.resolve</code> and do not read the
				facet — a wrap that admits <code>blob:</code> at render
				time still drops it on those exports.
			</p>

			<h2>Other library boundaries</h2>
			<ul>
				<li>
					Library rendering builds DOM through{" "}
					<code>createElement</code> / <code>textContent</code> /
					attribute setters. Parsing untrusted HTML uses{" "}
					<code>DOMParser</code> in <code>@input/pen-import-html</code>
					; that tree enters the document as data.
				</li>
				<li>
					<code>@input/pen-import-html</code> owns the sanitizer
					(DOMPurify via <code>isomorphic-dompurify</code>). Paste
					uses the same module.
				</li>
				<li>
					<code>@input/pen-document-ops</code> validates tool
					payloads before building ops. Invalid payloads produce
					diagnostics and no partial apply.
				</li>
				<li>
					<code>@input/pen-search</code> defaults{" "}
					<code>regex: false</code>, caps query length at 1,024
					characters, and budgets regex execution. A budget miss
					returns matches so far plus{" "}
					<code>search-budget-exceeded</code>.
				</li>
				<li>
					<code>pen.readOnly</code> is a local UI mode. It does not
					stop writes arriving over the wire.
				</li>
			</ul>
			<p>
				Pen does not encrypt content, authenticate peers, or sandbox
				host-provided custom renderers. Custom renderers that inject
				HTML are outside this boundary.
			</p>
		</>
	);
}
