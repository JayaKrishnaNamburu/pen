export function AccessibilityPage() {
	return (
		<>
			<h1>Accessibility</h1>
			<p>
				The library target is WCAG 2.2 AA for what Pen itself
				renders. Hosts compose primitives so a product can meet AA
				without fighting the editing surface, focus model, or live
				updates. The statement is{" "}
				<code>spec-v2/13-accessibility.md</code>.
			</p>

			<h2>Editing surface</h2>
			<p>
				Provide a label at construction. A string becomes{" "}
				<code>aria-label</code>. <code>{"{ labelledBy }"}</code>{" "}
				becomes <code>aria-labelledby</code>. A missing label
				diagnoses <code>a11y-missing-label</code> once, then falls
				back to <code>pen.editor.label</code>. The diagnostic fires
				only if a listener is already attached when the surface
				first resolves the label. Attach later and the warning is
				consumed silently.
			</p>
			<pre>
				<code>{`import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";

const editor = createEditor({
  preset: defaultPreset(),
  a11yLabel: "Document",
});`}</code>
			</pre>
			<p>
				React <code>EditorRoot</code>, Vue <code>PenEditor</code>,
				and <code>mountEditor</code> set{" "}
				<code>role=&quot;textbox&quot;</code>,{" "}
				<code>aria-multiline=&quot;true&quot;</code>, the resolved
				label, and <code>aria-readonly</code> from the{" "}
				<code>readonly</code> prop or <code>pen.readOnly</code>. The
				facet sets the attribute. The prop is what declines local
				typing.
			</p>

			<h2>What the library owns</h2>
			<ul>
				<li>
					Block schema may declare <code>a11y.label</code> and
					optional <code>a11y.roleDescription</code> through{" "}
					<code>defineBlock(...).a11y</code>.
				</li>
				<li>
					One live region per editor root announces catalog strings
					from <code>pen.messages</code> (
					<code>pen.a11y.*</code> keys). Hosts do not mount a
					second region for those events.
				</li>
				<li>
					Library styles do not remove focus indication. Overlay
					carets and selection rectangles are{" "}
					<code>aria-hidden</code> presentation.
				</li>
				<li>
					A motion helper in <code>@input/pen-dom</code> reads{" "}
					<code>prefers-reduced-motion: reduce</code>. It is not on
					the package index. Overlay and paint do not apply that
					flag yet. Missing <code>matchMedia</code> leaves
					animations on.
				</li>
			</ul>
			<p>
				Vue ships the editing surface only — no Vue slash menu,
				suggestion list, search, toolbar, or AI chrome. There is no
				library link-editor primitive; hosts own that popover.
			</p>
			<p>
				Conformance runs axe-core WCAG 2.2 AA on Chromium against
				the editor root after every scenario unless the scenario
				opts out. VoiceOver and NVDA checklist rows are a
				release-cut obligation, not a per-PR gate. The committed
				matrix at <code>packages/rendering/dom/src/a11y/MANUAL.md</code>{" "}
				is a stub: no AT session has been recorded. The library does
				not ship a high-contrast theme.
			</p>
		</>
	);
}
