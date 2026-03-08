import "./Toolbar.css";
import type { Editor } from "@pen/core";
import { htmlExporter } from "@pen/export-html";
import { markdownExporter } from "@pen/export-markdown";
import { Pen } from "@pen/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { PLAYGROUND_BLOCK_TYPE_ORDER } from "../constants/playground";
import {
	IconArrowUp,
	IconBold,
	IconCode,
	IconItalic,
	IconRedo,
	IconSidebarRight,
	IconStrikethrough,
	IconUnderline,
	IconUndo,
} from "./icons";

type ToolbarProps = {
	editor: Editor;
	isInspectorOpen: boolean;
	onToggleInspector: () => void;
};

export function Toolbar({
	editor,
	isInspectorOpen,
	onToggleInspector,
}: ToolbarProps) {
	const blockTypeOptions = getBlockTypeOptions(editor);

	const handleUndo = () => {
		editor.undoManager.undo();
	};

	const handleRedo = () => {
		editor.undoManager.redo();
	};

	return (
		<header className="toolbar">
			<div className="toolbar-left">
				<h4 className="toolbar-title">Pen</h4>
			</div>

			<div className="toolbar-right">
				<Pen.Toolbar.Root editor={editor}>
					<Pen.Toolbar.Group>
						<Pen.Toolbar.Toggle format="bold">
							<IconBold className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="italic">
							<IconItalic className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="underline">
							<IconUnderline className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="strikethrough">
							<IconStrikethrough className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
						<Pen.Toolbar.Toggle format="code">
							<IconCode className="toolbar-icon" />
						</Pen.Toolbar.Toggle>
					</Pen.Toolbar.Group>
					<Pen.Toolbar.Select
						format="blockType"
						options={blockTypeOptions}
					/>
				</Pen.Toolbar.Root>

				<Pen.Toolbar.Separator />

				<button
					className="toolbar-button toolbar-icon-button"
					onMouseDown={preventEditorBlur}
					onClick={handleUndo}
					type="button"
					title="Undo"
					aria-label="Undo"
				>
					<IconUndo size={12} className="toolbar-button-icon" />
				</button>
				<button
					className="toolbar-button toolbar-icon-button"
					onMouseDown={preventEditorBlur}
					onClick={handleRedo}
					type="button"
					title="Redo"
					aria-label="Redo"
				>
					<IconRedo size={12} className="toolbar-button-icon" />
				</button>

				<Pen.Toolbar.Separator />

				<ExportMenu editor={editor} />
				<button
					className="toolbar-button toolbar-icon-button"
					onClick={onToggleInspector}
					type="button"
					data-active={isInspectorOpen || undefined}
					title="Toggle inspector"
					aria-label="Toggle inspector"
				>
					<IconSidebarRight className="toolbar-button-icon" />
				</button>
			</div>
		</header>
	);
}

type ExportMenuProps = {
	editor: Editor;
};

function ExportMenu({ editor }: ExportMenuProps) {
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

			{isExportMenuOpen && <div className="toolbar-menu-popover">{exportMenuItems}</div>}
		</div>
	);
}

function getBlockTypeOptions(editor: Editor) {
	const displayByType = new Map(
		editor.schema
			.allBlockDisplays()
			.map((schema) => [schema.type, schema.display.title] as const),
	);

	return PLAYGROUND_BLOCK_TYPE_ORDER.map((type) => ({
		value: type,
		label: displayByType.get(type) ?? type,
	}));
}

function preventEditorBlur(event: MouseEvent<HTMLButtonElement>) {
	// Keep focus in the editor so history actions don't tear down the active
	// field-editor session before the command runs.
	event.preventDefault();
}
