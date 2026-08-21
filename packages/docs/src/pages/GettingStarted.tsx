export function GettingStartedPage() {
	return (
		<>
			<h1>Getting started</h1>
			<p>
				Start with <code>@input/pen-preset-default</code> and a host
				binding. <code>@input/pen-core</code> is the assembly point if
				you skip the preset. <code>createEditor()</code> does not
				install a schema or any extension — no bold/italic shortcuts,
				no undo, no <code>delta-stream</code>. Pass{" "}
				<code>preset: defaultPreset()</code>, or compose{" "}
				<code>schema: createDefaultSchema()</code> and an{" "}
				<code>extensions</code> list yourself.
			</p>
			<p>
				Minimal apps live in this repository at{" "}
				<code>examples/react</code>, <code>examples/vue</code>, and{" "}
				<code>examples/vanilla</code>. Each is a workspace member. Each
				README lists the packages and peer dependencies for that host.
			</p>
			<p>
				Pen ships no required stylesheet. Tokens live in the{" "}
				<code>STYLING.md</code> that ships inside{" "}
				<code>@input/pen-react</code>. Vue documents what it applies in
				its own <code>STYLING.md</code> and defers to that same token
				catalog.
			</p>
			<p>
				An empty <code>[data-pen-inline-content]</code> has zero width
				until it contains text, so a click on an empty paragraph never
				lands on the inline surface. Activation resolves the clicked{" "}
				<code>[data-pen-editor-block]</code> instead, in every binding.
				The first keystroke lands with no stylesheet at all; you do not
				need to give the inline surface a <code>min-width</code>.
			</p>
			<p>
				License and distribution are stated in the repository root
				README.
			</p>

			<h2>React</h2>
			<p>
				<code>@input/pen-react</code> is a client module. Its public
				entry points carry <code>"use client"</code>. In Next.js App
				Router, import <code>PenEditor</code> from a Client Component.
				<code>react</code> and <code>react-dom</code> are peers (
				<code>^18</code> or <code>^19</code>).{" "}
				<code>@input/pen-core</code> stays importable from server code.
			</p>
			<pre>
				<code>{`"use client";

import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "@input/pen-react";

const editor = createEditor({
  preset: defaultPreset(),
});

export function App() {
  return <PenEditor editor={editor} />;
}`}</code>
			</pre>

			<h2>Vue</h2>
			<p>
				<code>vue</code> <code>^3.4.0</code> is a peer of{" "}
				<code>@input/pen-vue</code>. Vue has no{" "}
				<code>"use client"</code> directive. Mount{" "}
				<code>PenEditor</code> in the browser, not during SSR.
			</p>
			<pre>
				<code>{`<script setup lang="ts">
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { PenEditor } from "@input/pen-vue";

const editor = createEditor({
  preset: defaultPreset(),
});
</script>

<template>
  <PenEditor :editor="editor" />
</template>`}</code>
			</pre>

			<h2>Vanilla DOM</h2>
			<p>
				<code>@input/pen-dom</code> is the field-editor engine. It has
				no extra peer dependencies. <code>mountEditor</code> is the same
				composition <code>@input/pen-react</code> and{" "}
				<code>@input/pen-vue</code> already assemble:{" "}
				<code>FieldEditorImpl</code>, the editor-root shell, and
				inline-content surfaces. Construct it in the browser, not during
				SSR. <code>FieldEditorImpl.setRootElement</code> alone does not
				render document blocks.
			</p>
			<pre>
				<code>{`import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { mountEditor } from "@input/pen-dom";

const editor = createEditor({
  preset: defaultPreset(),
});

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

mountEditor(editor, root);`}</code>
			</pre>
		</>
	);
}
