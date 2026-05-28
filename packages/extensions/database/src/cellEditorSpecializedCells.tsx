import { useCellTextSnapshot, useEditorContext } from "@pen/react";
import { useState } from "react";
import type { DatabaseCellContentProps } from "./cellEditors";
import { setCellText, widgetCellAttrs } from "./cellEditorUtils";

export function RelationCell(props: DatabaseCellContentProps) {
	const { blockId, row, col } = props;
	const { editor } = useEditorContext();
	const readonly = !!props.readonly;
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const currentValue = textSnapshot.text ?? "";
	const [isEditing, setIsEditing] = useState(false);
	const [draftValue, setDraftValue] = useState(currentValue);

	function handleSave() {
		setCellText(editor, blockId, row, col, draftValue.trim());
		setIsEditing(false);
	}

	if (!isEditing) {
		return (
			<span
				{...widgetCellAttrs(row, col)}
				className="pen-db-relation-cell"
				data-pen-db-widget-trigger="relation"
				role="button"
				tabIndex={readonly ? -1 : 0}
				onClick={(event) => {
					if (readonly) return;
					event.stopPropagation();
					setDraftValue(currentValue);
					setIsEditing(true);
				}}
			>
				{currentValue ? (
					<span className="pen-db-tag pen-db-tag-plain">{currentValue}</span>
				) : (
					<span className="pen-db-select-placeholder">Link record…</span>
				)}
			</span>
		);
	}

	return (
		<span {...widgetCellAttrs(row, col)} className="pen-db-relation-editor">
			<input
				type="text"
				value={draftValue}
				placeholder="Record id…"
				onChange={(event) => setDraftValue(event.target.value)}
				onClick={(event) => event.stopPropagation()}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						handleSave();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						setIsEditing(false);
					}
				}}
				autoFocus
			/>
			<button onClick={handleSave}>Save</button>
			<button
				onClick={(event) => {
					event.stopPropagation();
					setCellText(editor, blockId, row, col, "");
					setIsEditing(false);
				}}
			>
				Clear
			</button>
		</span>
	);
}

export function FormulaCell(props: DatabaseCellContentProps) {
	const { blockId, row, col } = props;
	const { editor } = useEditorContext();
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const currentValue = textSnapshot.text ?? "";

	return (
		<span {...widgetCellAttrs(row, col)} className="pen-db-formula-cell" aria-readonly="true">
			{currentValue || <span className="pen-db-select-placeholder">Computed value</span>}
		</span>
	);
}

export function DateCell(props: DatabaseCellContentProps) {
	const { blockId, row, col, column } = props;
	const { editor } = useEditorContext();
	const readonly = !!props.readonly;
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const raw = textSnapshot.text ?? "";

	let display = "";
	if (raw) {
		const d = new Date(raw);
		if (!Number.isNaN(d.getTime())) {
			const fmt = column.format as { includeTime?: boolean; dateStyle?: "short" | "medium" | "long" } | undefined;
			const opts: Intl.DateTimeFormatOptions = { dateStyle: fmt?.dateStyle ?? "medium" };
			if (fmt?.includeTime) opts.timeStyle = "short";
			display = new Intl.DateTimeFormat(undefined, opts).format(d);
		} else {
			display = raw;
		}
	}

	function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
		if (readonly) return;
		setCellText(editor, blockId, row, col, event.target.value ? new Date(event.target.value).toISOString() : "");
	}

	return (
		<span {...widgetCellAttrs(row, col)} className="pen-db-date-cell">
			{display || <span className="pen-db-date-placeholder">Pick date…</span>}
			{!readonly && (
				<input
					type="date"
					className="pen-db-date-input"
					data-pen-db-widget-trigger="date"
					value={raw ? raw.slice(0, 10) : ""}
					onChange={handleDateChange}
				/>
			)}
		</span>
	);
}
