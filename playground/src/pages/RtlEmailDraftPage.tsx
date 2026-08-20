import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { Pen } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import { useEffect, useState } from "react";
import { applyRtlEmailDraft } from "../fixtures/rtlEmailDraft";

export function RtlEmailDraftPage() {
	const [editor, setEditor] = useState<Editor | null>(null);

	useEffect(() => {
		const nextEditor = createEditor({
			documentProfile: "structured",
			preset: defaultPreset(),
		});
		applyRtlEmailDraft(nextEditor);
		setEditor(nextEditor);

		return () => {
			nextEditor.destroy();
			setEditor(null);
		};
	}, []);

	if (!editor) {
		return null;
	}

	return (
		<Pen.Editor.Root editor={editor}>
			<div
				className="playground-shell"
				data-playground-fixture="rtl-email"
			>
				<div className="playground-editor-column">
					<header className="toolbar">
						<div className="toolbar-left">
							<h4 className="toolbar-title">RTL email draft</h4>
							<a className="toolbar-mode-toggle" href="/">
								Playground
							</a>
						</div>
					</header>
					<div className="playground-editor-viewport">
						<Pen.Editor.Content emptyPlaceholder="RTL email draft" />
						<Pen.Editor.SelectionRect />
						<Pen.Editor.CaretOverlay />
					</div>
				</div>
			</div>
		</Pen.Editor.Root>
	);
}
