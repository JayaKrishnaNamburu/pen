export function GettingStartedPage() {
	return (
		<>
			<h1>Getting started</h1>
			<p>
				Start with <code>@input/pen-preset-default</code> and a host
				binding. <code>@input/pen-core</code> is the assembly point if
				you skip the preset. <code>createEditor()</code> does not
				install a schema by itself — pass{" "}
				<code>preset: defaultPreset()</code> or{" "}
				<code>schema: createDefaultSchema()</code>.
			</p>
			<p>
				Minimal apps live in this repository at{" "}
				<code>examples/react</code>, <code>examples/vue</code>, and{" "}
				<code>examples/vanilla</code>. Those example packages are not
				workspace members yet. Each README lists the packages and peer
				dependencies for that host.
			</p>
			<p>
				Pen ships no required stylesheet — the editor is functional
				unstyled. Tokens live in the <code>STYLING.md</code> that ships
				inside <code>@input/pen-react</code>. Vue documents what it
				applies in its own <code>STYLING.md</code> and defers to that
				same token catalog.
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
				no extra peer dependencies. The host renders document blocks —
				React and Vue do that for those hosts. Construct{" "}
				<code>FieldEditorImpl</code> in the browser, not during SSR.
			</p>
			<pre>
				<code>{`import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { FieldEditorImpl } from "@input/pen-dom";

const editor = createEditor({
  preset: defaultPreset(),
});

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

const fieldEditor = new FieldEditorImpl(editor);
fieldEditor.setRootElement(root);`}</code>
			</pre>
		</>
	);
}
