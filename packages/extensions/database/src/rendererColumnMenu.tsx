import { DATA_ATTRS } from "@pen/react";
import { useEffect, useState } from "react";
import type { ColumnType, DatabaseColumnDef } from "./types";

const COLUMN_TYPES: ColumnType[] = [
	"text",
	"number",
	"checkbox",
	"select",
	"multiSelect",
	"date",
	"url",
	"email",
	"relation",
];

const OPTION_COLOR_CHOICES = [
	"gray",
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
	"pink",
] as const;
export function ColumnMenu(props: {
	column: DatabaseColumnDef | undefined;
	onClose: () => void;
	onRename: (title: string) => void;
	onChangeType: (type: ColumnType) => void;
	onDelete: () => void;
	onToggleVisibility: () => void;
	onChangePin: (nextPinned: "left" | "right" | undefined) => void;
	onAddOption: (value: string, color?: string) => void;
	onRenameOption: (optionId: string, value: string) => void;
	onRecolorOption: (optionId: string, color: string) => void;
	onRemoveOption: (optionId: string) => void;
	onMoveOption: (optionId: string, direction: "up" | "down") => void;
}) {
	const {
		column,
		onClose,
		onRename,
		onChangeType,
		onDelete,
		onToggleVisibility,
		onChangePin,
		onAddOption,
		onRenameOption,
		onRecolorOption,
		onRemoveOption,
		onMoveOption,
	} = props;

	const [renameValue, setRenameValue] = useState(column?.title ?? "");
	const [showTypeMenu, setShowTypeMenu] = useState(false);
	const [newOptionValue, setNewOptionValue] = useState("");
	const [newOptionColor, setNewOptionColor] = useState<string>("gray");

	const typeItems = COLUMN_TYPES.map((type) => (
		<button
			key={type}
			className={`pen-db-col-menu-item ${column?.type === type ? "pen-db-col-menu-item-active" : ""}`}
			onClick={() => onChangeType(type)}
		>
			{type}
		</button>
	));
	const typeMenu = showTypeMenu ? (
		<div className="pen-db-col-type-submenu">{typeItems}</div>
	) : null;
	const supportsOptionEditing =
		column?.type === "select" || column?.type === "multiSelect";
	const pinMenuButtons = (
		<div className="pen-db-col-menu-section">
			<button className="pen-db-col-menu-item" onClick={() => onChangePin("left")}>
				Pin left
			</button>
			<button className="pen-db-col-menu-item" onClick={() => onChangePin("right")}>
				Pin right
			</button>
			<button
				className="pen-db-col-menu-item"
				onClick={() => onChangePin(undefined)}
			>
				Unpin
			</button>
		</div>
	);
	const optionColorItems = OPTION_COLOR_CHOICES.map((color) => (
		<option key={color} value={color}>
			{color}
		</option>
	));
	const optionEditorRows = (column?.options ?? []).map((option, index, options) => (
		<OptionEditorRow
			key={option.id}
			option={option}
			colorItems={optionColorItems}
			canMoveUp={index > 0}
			canMoveDown={index < options.length - 1}
			onRename={(value) => onRenameOption(option.id, value)}
			onRecolor={(color) => onRecolorOption(option.id, color)}
			onRemove={() => onRemoveOption(option.id)}
			onMoveUp={() => onMoveOption(option.id, "up")}
			onMoveDown={() => onMoveOption(option.id, "down")}
		/>
	));
	const optionEditor = supportsOptionEditing ? (
		<div className="pen-db-col-menu-section">
			<div className="pen-db-col-menu-label">Options</div>
			{optionEditorRows}
			<div className="pen-db-col-option-add">
				<input
					className="pen-db-col-rename-input"
					value={newOptionValue}
					placeholder="New option"
					onChange={(event) => setNewOptionValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							onAddOption(newOptionValue, newOptionColor);
							setNewOptionValue("");
						}
					}}
				/>
				<select
					value={newOptionColor}
					onChange={(event) => setNewOptionColor(event.target.value)}
				>
					{optionColorItems}
				</select>
				<button
					className="pen-db-col-menu-item"
					onClick={() => {
						onAddOption(newOptionValue, newOptionColor);
						setNewOptionValue("");
					}}
				>
					Add
				</button>
			</div>
		</div>
	) : null;

	return (
		<div
			className="pen-db-col-menu"
			{...{ [DATA_ATTRS.ignorePointerGesture]: "" }}
			onMouseDownCapture={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		>
			<div className="pen-db-col-menu-section">
				<input
					className="pen-db-col-rename-input"
					value={renameValue}
					onChange={(event) => setRenameValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							onRename(renameValue);
						}
						if (event.key === "Escape") {
							onClose();
						}
					}}
					autoFocus
				/>
			</div>
			<div className="pen-db-col-menu-section">
				<button
					className="pen-db-col-menu-item"
					onClick={() => setShowTypeMenu(!showTypeMenu)}
				>
					Type: {column?.type ?? "text"} ▸
				</button>
				{typeMenu}
				{column?.type === "formula" ? (
					<div className="pen-db-col-menu-hint">
						Formula columns are read-only until the evaluator lands.
					</div>
				) : null}
			</div>
			{optionEditor}
			<div className="pen-db-col-menu-section">
				<button className="pen-db-col-menu-item" onClick={onToggleVisibility}>
					Hide column
				</button>
			</div>
			{pinMenuButtons}
			<div className="pen-db-col-menu-section">
				<button
					className="pen-db-col-menu-item pen-db-col-menu-item-danger"
					onClick={onDelete}
				>
					Delete column
				</button>
			</div>
			<div className="pen-db-col-menu-section">
				<button className="pen-db-col-menu-item" onClick={onClose}>
					Close
				</button>
			</div>
		</div>
	);
}

function OptionEditorRow(props: {
	option: NonNullable<DatabaseColumnDef["options"]>[number];
	colorItems: React.ReactElement[];
	canMoveUp: boolean;
	canMoveDown: boolean;
	onRename: (value: string) => void;
	onRecolor: (color: string) => void;
	onRemove: () => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
}) {
	const {
		option,
		colorItems,
		canMoveUp,
		canMoveDown,
		onRename,
		onRecolor,
		onRemove,
		onMoveUp,
		onMoveDown,
	} = props;

	const [value, setValue] = useState(option.value);

	useEffect(() => {
		setValue(option.value);
	}, [option.id, option.value]);

	return (
		<div className="pen-db-col-option-row">
			<input
				className="pen-db-col-rename-input"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				onBlur={() => onRename(value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						onRename(value);
					}
				}}
			/>
			<select
				value={option.color ?? "gray"}
				onChange={(event) => onRecolor(event.target.value)}
			>
				{colorItems}
			</select>
			<button className="pen-db-col-menu-item" onClick={onMoveUp} disabled={!canMoveUp}>
				↑
			</button>
			<button
				className="pen-db-col-menu-item"
				onClick={onMoveDown}
				disabled={!canMoveDown}
			>
				↓
			</button>
			<button
				className="pen-db-col-menu-item pen-db-col-menu-item-danger"
				onClick={onRemove}
			>
				×
			</button>
		</div>
	);
}
