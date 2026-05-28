import { htmlExporter } from "@pen/export-html";
import { markdownExporter } from "@pen/export-markdown";
import type { Editor } from "@pen/types";
import { useEffect, useRef, useState } from "react";
import { IconArrowUp } from "./icons";
import { preventEditorBlur } from "./ToolbarUtils";

type ExportMenuProps = {
	editor: Editor;
};

export function ExportMenu({ editor }: ExportMenuProps) {
	const exportMenuRef = useRef<HTMLDivElement | null>(null);
	const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

	const exportMenuItems = [
		{
			id: "markdown",
			label: "Markdown",
			onSelect: () => {
				const markdown = markdownExporter.export(editor, {});
				navigator.clipboard.writeText(markdown as string);
			},
		},
		{
			id: "html",
			label: "HTML",
			onSelect: () => {
				const html = htmlExporter.export(editor, {});
				navigator.clipboard.writeText(html as string);
			},
		},
	].map((item) => (
		<button
			key={item.id}
			className="toolbar-menu-item"
			type="button"
			onMouseDown={preventEditorBlur}
			onClick={() => {
				item.onSelect();
				setIsExportMenuOpen(false);
			}}
		>
			{item.label}
		</button>
	));

	useEffect(() => {
		if (!isExportMenuOpen) {
			return;
		}

		const handlePointerDown = (event: PointerEvent) => {
			const exportMenuElement = exportMenuRef.current;

			if (!exportMenuElement?.contains(event.target as Node)) {
				setIsExportMenuOpen(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsExportMenuOpen(false);
			}
		};

		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isExportMenuOpen]);

	return (
		<div className="toolbar-menu" ref={exportMenuRef}>
			<button
				className="toolbar-button toolbar-icon-button"
				type="button"
				title="Export"
				aria-label="Export"
				aria-haspopup="menu"
				aria-expanded={isExportMenuOpen}
				data-active={isExportMenuOpen || undefined}
				onMouseDown={preventEditorBlur}
				onClick={() => setIsExportMenuOpen((value) => !value)}
			>
				<IconArrowUp className="toolbar-button-icon" />
			</button>

			{isExportMenuOpen && (
				<div className="toolbar-menu-popover">{exportMenuItems}</div>
			)}
		</div>
	);
}
