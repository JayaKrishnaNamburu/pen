import React, { useRef, useLayoutEffect, useState } from "react";
import {
	normalizeStoredMultiSelectValue,
	normalizeStoredSelectValue,
	resolveStoredSelectOption,
} from "@pen/types";
import {
	useEditorContext,
	useFieldEditorContext,
	useFieldEditorState,
	useCellTextSnapshot,
	DATA_ATTRS,
} from "@pen/react";
import { fullReconcileDeltasToDOM } from "@pen/react";
import type { ColumnType, DatabaseColumnDef, SelectOption } from "./types";
import { isContentEditableColumnType } from "./types";
import type { CellEditorRegistry } from "./cellEditorRegistry";

import {
	editableCellAttrs,
	isCellActive,
	setCellText,
	tagColor,
	toggleCheckbox,
	widgetCellAttrs,
} from "./cellEditorUtils";
import { DateCell, FormulaCell, RelationCell } from "./cellEditorSpecializedCells";
export const DATABASE_CELL_EDITOR_REGISTRY_SLOT = "database:cell-editor-registry";

export interface DatabaseCellContentProps {
	blockId: string;
	row: number;
	col: number;
	column: DatabaseColumnDef;
	placeholder?: string;
	readonly?: boolean;
}

export function DatabaseCellContent(props: DatabaseCellContentProps) {
	const { column } = props;
	const { editor } = useEditorContext();
	const registry = editor.internals.getSlot(DATABASE_CELL_EDITOR_REGISTRY_SLOT) as CellEditorRegistry | undefined;
	const CustomEditor = registry?.get(column.type);
	if (CustomEditor) {
		return <CustomEditor {...props} />;
	}
	return <BuiltInCellContent {...props} />;
}

function BuiltInCellContent(props: DatabaseCellContentProps) {
	const { column } = props;
	switch (column.type) {
		case "checkbox":
			return <CheckboxCell {...props} />;
		case "select":
			return <SelectCell {...props} />;
		case "multiSelect":
			return <MultiSelectCell {...props} />;
		case "relation":
			return <RelationCell {...props} />;
		case "formula":
			return <FormulaCell {...props} />;
		case "date":
			return <DateCell {...props} />;
		case "number":
			return <NumberCell {...props} />;
		case "url":
			return <UrlCell {...props} />;
		case "email":
			return <EmailCell {...props} />;
		default:
			return <TextCell {...props} />;
	}
}

function TextCell(props: DatabaseCellContentProps) {
	const { blockId, row, col, placeholder } = props;
	const { editor } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const elementRef = useRef<HTMLSpanElement>(null);

	const isActive = isCellActive(fieldEditorState, blockId, row, col);
	const showPlaceholder = !!placeholder && (!textSnapshot.text || textSnapshot.text === "\u200B");

	useLayoutEffect(() => {
		if (isActive && elementRef.current && fieldEditor) {
			fieldEditor.attachElement(elementRef.current);
		}
	}, [isActive, fieldEditor]);

	useLayoutEffect(() => {
		if (isActive) return;
		if (!elementRef.current) return;
		if (!textSnapshot.exists) {
			elementRef.current.replaceChildren();
			return;
		}
		fullReconcileDeltasToDOM(
			[...textSnapshot.deltas],
			elementRef.current,
			editor.schema,
			{ preserveSelection: false },
		);
	}, [editor, isActive, textSnapshot]);

	return (
		<span
			ref={elementRef}
			{...editableCellAttrs(isActive, row, col, showPlaceholder, placeholder)}
		/>
	);
}

function NumberCell(props: DatabaseCellContentProps) {
	const { blockId, row, col, placeholder } = props;
	const { editor } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const elementRef = useRef<HTMLSpanElement>(null);

	const isActive = isCellActive(fieldEditorState, blockId, row, col);
	const showPlaceholder = !!placeholder && (!textSnapshot.text || textSnapshot.text === "\u200B");

	useLayoutEffect(() => {
		if (isActive && elementRef.current && fieldEditor) {
			fieldEditor.attachElement(elementRef.current);
		}
	}, [isActive, fieldEditor]);

	useLayoutEffect(() => {
		if (isActive) return;
		if (!elementRef.current) return;
		if (!textSnapshot.exists) {
			elementRef.current.replaceChildren();
			return;
		}
		fullReconcileDeltasToDOM(
			[...textSnapshot.deltas],
			elementRef.current,
			editor.schema,
			{ preserveSelection: false },
		);
	}, [editor, isActive, textSnapshot]);

	return (
		<span
			ref={elementRef}
			{...editableCellAttrs(isActive, row, col, showPlaceholder, placeholder)}
			style={{ textAlign: "right", display: "block", width: "100%", minWidth: "4rem", minHeight: "1.5rem" }}
		/>
	);
}

function UrlCell(props: DatabaseCellContentProps) {
	const { blockId, row, col, placeholder } = props;
	const { editor } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const elementRef = useRef<HTMLSpanElement>(null);

	const isActive = isCellActive(fieldEditorState, blockId, row, col);
	const rawText = textSnapshot.text ?? "";
	const showPlaceholder = !!placeholder && (!rawText || rawText === "\u200B");

	useLayoutEffect(() => {
		if (isActive && elementRef.current && fieldEditor) {
			fieldEditor.attachElement(elementRef.current);
		}
	}, [isActive, fieldEditor]);

	useLayoutEffect(() => {
		if (isActive) return;
		if (!elementRef.current) return;
		if (!textSnapshot.exists) {
			elementRef.current.replaceChildren();
			return;
		}
		fullReconcileDeltasToDOM(
			[...textSnapshot.deltas],
			elementRef.current,
			editor.schema,
			{ preserveSelection: false },
		);
	}, [editor, isActive, textSnapshot]);

	return (
		<span
			ref={elementRef}
			{...editableCellAttrs(isActive, row, col, showPlaceholder, placeholder)}
			className="pen-db-url-cell"
		/>
	);
}

function EmailCell(props: DatabaseCellContentProps) {
	const { blockId, row, col, placeholder } = props;
	const { editor } = useEditorContext();
	const fieldEditor = useFieldEditorContext();
	const fieldEditorState = useFieldEditorState(fieldEditor);
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const elementRef = useRef<HTMLSpanElement>(null);

	const isActive = isCellActive(fieldEditorState, blockId, row, col);
	const rawText = textSnapshot.text ?? "";
	const showPlaceholder = !!placeholder && (!rawText || rawText === "\u200B");

	useLayoutEffect(() => {
		if (isActive && elementRef.current && fieldEditor) {
			fieldEditor.attachElement(elementRef.current);
		}
	}, [isActive, fieldEditor]);

	useLayoutEffect(() => {
		if (isActive) return;
		if (!elementRef.current) return;
		if (!textSnapshot.exists) {
			elementRef.current.replaceChildren();
			return;
		}
		fullReconcileDeltasToDOM(
			[...textSnapshot.deltas],
			elementRef.current,
			editor.schema,
			{ preserveSelection: false },
		);
	}, [editor, isActive, textSnapshot]);

	return (
		<span
			ref={elementRef}
			{...editableCellAttrs(isActive, row, col, showPlaceholder, placeholder)}
			className="pen-db-email-cell"
		/>
	);
}

function CheckboxCell(props: DatabaseCellContentProps) {
	const { blockId, row, col } = props;
	const { editor } = useEditorContext();
	const readonly = !!props.readonly;
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const isChecked = textSnapshot.text?.toLowerCase() === "true";

	function handleToggle(event: React.MouseEvent) {
		if (readonly) return;
		event.preventDefault();
		event.stopPropagation();
		toggleCheckbox(editor, blockId, row, col, isChecked);
	}

	function handleKeyDown(event: React.KeyboardEvent) {
		if (readonly) return;
		if (event.key === " " || event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			toggleCheckbox(editor, blockId, row, col, isChecked);
		}
	}

	return (
		<span
			{...widgetCellAttrs(row, col)}
			role="checkbox"
			aria-checked={isChecked}
			tabIndex={0}
			onClick={handleToggle}
			onKeyDown={handleKeyDown}
			className="pen-db-checkbox"
		>
			{isChecked ? "☑" : "☐"}
		</span>
	);
}

function SelectCell(props: DatabaseCellContentProps) {
	const { blockId, row, col, column } = props;
	const { editor } = useEditorContext();
	const readonly = !!props.readonly;
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const currentValue = textSnapshot.text ?? "";
	const options = column.options ?? [];
	const matchedOption = resolveStoredSelectOption(currentValue, options);
	const normalizedValue = normalizeStoredSelectValue(currentValue, options);
	const [isOpen, setIsOpen] = useState(false);

	function handleSelect(option: SelectOption) {
		setCellText(editor, blockId, row, col, option.id);
		setIsOpen(false);
	}

	function handleClear() {
		setCellText(editor, blockId, row, col, "");
		setIsOpen(false);
	}

	const selectOptionItems = options.map((opt) => (
		<button
			key={opt.id}
			className={`pen-db-select-option ${opt.id === normalizedValue ? "pen-db-select-option-active" : ""}`}
			onClick={() => handleSelect(opt)}
		>
			<span
				className="pen-db-tag"
				style={{ backgroundColor: tagColor(opt.color) }}
			>
				{opt.value}
			</span>
		</button>
	));

	return (
		<span {...widgetCellAttrs(row, col)} className="pen-db-select-cell">
			<span
				className="pen-db-select-trigger"
				data-pen-db-widget-trigger="select"
				role="button"
				tabIndex={readonly ? -1 : 0}
				onClick={(e) => {
					if (readonly) return;
					e.stopPropagation();
					setIsOpen(!isOpen);
				}}
			>
				{matchedOption ? (
					<span
						className="pen-db-tag"
						style={{ backgroundColor: tagColor(matchedOption.color) }}
					>
						{matchedOption.value}
					</span>
				) : (
					<span className="pen-db-select-placeholder">{currentValue ? "(removed)" : "Select…"}</span>
				)}
			</span>
			{isOpen && (
				<div className="pen-db-select-dropdown" onClick={(e) => e.stopPropagation()}>
					{selectOptionItems}
					{currentValue && (
						<button className="pen-db-select-option pen-db-select-clear" onClick={handleClear}>
							Clear
						</button>
					)}
				</div>
			)}
		</span>
	);
}

function MultiSelectCell(props: DatabaseCellContentProps) {
	const { blockId, row, col, column } = props;
	const { editor } = useEditorContext();
	const readonly = !!props.readonly;
	const textSnapshot = useCellTextSnapshot(editor, blockId, row, col);
	const raw = textSnapshot.text ?? "";
	const options = column.options ?? [];
	const [isOpen, setIsOpen] = useState(false);

	const selectedValues = normalizeStoredMultiSelectValue(raw, options);

	function handleToggleOption(optionId: string) {
		const next = selectedValues.includes(optionId)
			? selectedValues.filter((value) => value !== optionId)
			: [...selectedValues, optionId];
		setCellText(editor, blockId, row, col, JSON.stringify(next));
	}

	const tags = selectedValues.map((val) => {
		const opt = resolveStoredSelectOption(val, options);
		return (
			<span
				key={val}
				className="pen-db-tag"
				style={{ backgroundColor: opt ? tagColor(opt.color) : undefined }}
			>
				{opt?.value ?? "(removed)"}
			</span>
		);
	});

	const multiSelectOptionItems = options.map((opt) => (
		<label key={opt.id} className="pen-db-multiselect-option">
			<input
				type="checkbox"
				checked={selectedValues.includes(opt.id)}
				onChange={() => handleToggleOption(opt.id)}
			/>
			<span
				className="pen-db-tag"
				style={{ backgroundColor: tagColor(opt.color) }}
			>
				{opt.value}
			</span>
		</label>
	));

	return (
		<span {...widgetCellAttrs(row, col)} className="pen-db-multiselect-cell">
			<span
				className="pen-db-select-trigger"
				data-pen-db-widget-trigger="multiSelect"
				role="button"
				tabIndex={readonly ? -1 : 0}
				onClick={(e) => {
					if (readonly) return;
					e.stopPropagation();
					setIsOpen(!isOpen);
				}}
			>
				{tags.length > 0 ? tags : <span className="pen-db-select-placeholder">Select…</span>}
			</span>
			{isOpen && (
				<div className="pen-db-select-dropdown" onClick={(e) => e.stopPropagation()}>
					{multiSelectOptionItems}
				</div>
			)}
		</span>
	);
}


