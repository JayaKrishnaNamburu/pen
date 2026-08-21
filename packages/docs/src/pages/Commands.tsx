export function CommandsPage() {
	return (
		<>
			<h1>Commands and keymaps</h1>
			<p>
				The v2 design makes every editing action a named command with
				typed parameters. Keymaps, menus, and AI tools are supposed to
				dispatch those commands. That dispatch path is not a host API
				yet.
			</p>

			<h2>What hosts can use</h2>
			<p>
				Command contracts (<code>Command</code>,{" "}
				<code>CommandHandler</code>,{" "}
				<code>CommandHandlerProvider</code>) live in{" "}
				<code>@input/pen-types</code>. <code>commandsFacet</code> and{" "}
				<code>keymapFacet</code> export from{" "}
				<code>@input/pen-core</code>.
			</p>
			<p>
				<code>Editor</code> has no <code>dispatch</code> or{" "}
				<code>canDispatch</code> method.{" "}
				<code>defineCommand</code>, <code>commandHandler</code>, and{" "}
				<code>createCommandRegistry</code> exist under{" "}
				<code>packages/core/src/commands/</code> and are not on the{" "}
				<code>@input/pen-core</code> package index.
			</p>

			<h2>Keymaps today</h2>
			<p>
				<code>Extension.keyBindings</code> is still the contribution
				channel. The default preset installs{" "}
				<code>richTextShortcutsExtension</code> from{" "}
				<code>@input/pen-shortcuts</code> unless{" "}
				<code>shortcuts: false</code> is passed. Custom bindings still
				go on the extension <code>keyBindings</code> array.
			</p>
			<p>
				<code>spec-v2/05-commands.md</code> lists the intended built-in
				catalog (<code>pen.caretLeft</code>,{" "}
				<code>pen.insertText</code>, <code>pen.splitBlock</code>, and
				the rest). Do not import those names from core — they are not
				exported for hosts.
			</p>
			<p>
				Until dispatch is exported, host-authored editing behavior
				goes through <code>editor.apply</code> and the selection
				helpers, the same as any other mutation.
			</p>
		</>
	);
}
