export function AIPage() {
	return (
		<>
			<h1>AI features</h1>
			<p>
				AI packages are headless. They install runtime, controllers,
				and suggestion state. The host owns the model, auth, and
				transport. The playground is a maintainer kitchen sink, not
				an example.
			</p>

			<h2>Contracts</h2>
			<p>
				<code>ModelAdapter</code> and <code>PenTransport</code> are
				types on <code>@input/pen-types</code>. An adapter exposes{" "}
				<code>stream()</code>. A transport exposes{" "}
				<code>stream</code>, <code>connect</code>,{" "}
				<code>disconnect</code>, and connection listeners.{" "}
				<code>@input/pen-transport-direct</code> exports{" "}
				<code>directTransport</code>.{" "}
				<code>@input/pen-transport-sse</code> exports{" "}
				<code>sseTransport</code> and <code>createSSEHandler</code>.
			</p>

			<h2>Runtime</h2>
			<p>
				<code>@input/pen-ai</code> installs the AI extension. Pair it
				with a renderer when you want review chrome. React exposes AI
				surfaces on the <code>@input/pen-react/ai</code> and{" "}
				<code>@input/pen-react/ai-suggestions</code> subpaths.
			</p>
			<pre>
				<code>{`import { createEditor } from "@input/pen-core";
import { aiExtension, getAIController } from "@input/pen-ai";

const editor = createEditor({
  extensions: [
    aiExtension({
      suggestMode: true,
      author: "Ada",
    }),
  ],
});

const ai = getAIController(editor);`}</code>
			</pre>
			<p>
				Suggest mode sends AI-authored edits through the suggestion
				and review path instead of replacing document text
				immediately. Streaming writes go through{" "}
				<code>editor.openTextStream</code> /{" "}
				<code>@input/pen-delta-stream</code>, not direct Yjs text
				writes.
			</p>

			<h2>Related packages</h2>
			<ul>
				<li>
					<code>@input/pen-ai-suggestions</code> —{" "}
					<code>aiSuggestionsExtension</code>, host-provided
					analyzer
				</li>
				<li>
					<code>@input/pen-ai-autocomplete</code> —{" "}
					<code>autocompleteExtension</code>,{" "}
					<code>getAutocompleteController</code>
				</li>
				<li>
					<code>@input/pen-ai-tools</code> —{" "}
					<code>getAIToolRuntime</code>, <code>listAITools</code>,{" "}
					<code>executeAITool</code>
				</li>
				<li>
					<code>@input/pen-ai-skills</code> — skill descriptions for
					agent workflows
				</li>
				<li>
					<code>@input/pen-document-ops</code> — structured document
					tools; payloads are validated before ops are built
				</li>
			</ul>
		</>
	);
}
