import "./Toolbar.css";
import type { Editor } from "@pen/types";
import { htmlExporter } from "@pen/export-html";
import { markdownExporter } from "@pen/export-markdown";
import { setInlineMark } from "@pen/shortcuts";
import { Pen, useMultiplayer, useToolbar } from "@pen/react";
import {
	useEffect,
	useRef,
	useState,
	type FormEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent,
	type RefObject,
} from "react";
import { PLAYGROUND_BLOCK_TYPE_ORDER } from "../constants/playground";
import type { PlaygroundCollaborationConfig } from "../utils/playgroundCollaboration";
import {
	IconArrowUp,
	IconBold,
	IconChain,
	IconCode,
	IconItalic,
	IconRedo,
	IconStrikethrough,
	IconUnderline,
	IconUndo,
} from "./icons";
import {
	canOpenLinkEditor,
	getActiveLinkMark,
	removeLinkMark,
} from "../utils/linkMarks";

type ToolbarProps = {
	editor: Editor;
	linkToggleRef: RefObject<(() => void) | null>;
	collaboration?: PlaygroundCollaborationConfig | null;
	interactionModel?: "content-first" | "block-first";
	onToggleInteractionModel?: () => void;
};

export function Toolbar({
	editor,
	linkToggleRef,
	collaboration = null,
	interactionModel = "content-first",
	onToggleInteractionModel,
}: ToolbarProps) {
	const blockTypeOptions = getBlockTypeOptions(editor);
	const interactionModeLabel =
		interactionModel === "block-first" ? "Block-first" : "Content-first";

	const handleUndo = () => {
		editor.undoManager.undo();
	};

	const handleRedo = () => {
		editor.undoManager.redo();
	};

	return (
		<header className="toolbar" data-pen-ignore-pointer-gesture="">
			<div className="toolbar-left">
				<h4 className="toolbar-title">Pen</h4>
				{collaboration ? (
					<CollaborationStatus
						editor={editor}
						room={collaboration.room}
						userName={collaboration.user.name}
					/>
				) : null}
				{onToggleInteractionModel ? (
					<button
						className="toolbar-mode-toggle"
						data-active={interactionModel === "block-first" || undefined}
						onMouseDown={preventEditorBlur}
						onClick={onToggleInteractionModel}
						type="button"
						title={`Selection model: ${interactionModeLabel}`}
						aria-label={`Toggle selection model. Current mode: ${interactionModeLabel}`}
					>
						{interactionModeLabel}
					</button>
				) : null}
			</div>

			<div className="toolbar-right">
				<Pen.Toolbar.Root editor={editor}>
					<Pen.Toolbar.Select
						format="blockType"
						options={blockTypeOptions}
					/>

					<Pen.Toolbar.Separator />

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
						<LinkButton editor={editor} linkToggleRef={linkToggleRef} />
					</Pen.Toolbar.Group>
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
			</div>
		</header>
	);
}

type CollaborationStatusProps = {
	editor: Editor;
	room: string;
	userName: string;
};

function CollaborationStatus({
	editor,
	room,
	userName,
}: CollaborationStatusProps) {
	const multiplayerState = useMultiplayer(editor);
	const statusLabel = getCollaborationStatusLabel(
		multiplayerState.connectionState,
	);
	const statusTone = getCollaborationStatusTone(multiplayerState.connectionState);

	return (
		<div className="toolbar-collaboration">
			<div className="toolbar-collaboration-summary">
				<span
					className="toolbar-collaboration-status"
					data-tone={statusTone}
					title={`Connection: ${statusLabel}`}
				>
					<span className="toolbar-collaboration-status-dot" />
					<span>{statusLabel}</span>
				</span>
				<span
					className="toolbar-collaboration-self"
					title={`You are ${userName}`}
				>
					{userName}
				</span>
			</div>
			<div className="toolbar-collaboration-peers">
				<Pen.Multiplayer.PresenceList
					editor={editor}
					maxVisible={4}
					renderAvatar={(peer) => (
						<span
							className="toolbar-collaboration-avatar"
							style={{
								backgroundColor: peer.user.color ?? "var(--accent)",
							}}
							title={peer.user.name}
						>
							{getInitials(peer.user.name)}
						</span>
					)}
				/>
			</div>
		</div>
	);
}

// ── Link button with popover ────────────────────────────────

type LinkButtonProps = {
	editor: Editor;
	linkToggleRef: RefObject<(() => void) | null>;
};

function LinkButton({ editor, linkToggleRef }: LinkButtonProps) {
	const toolbarState = useToolbar(editor);
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [isPopoverOpen, setIsPopoverOpen] = useState(false);
	const [url, setUrl] = useState("");

	const activeLinkValue = toolbarState.activeMarks.link;
	const activeLink =
		activeLinkValue && typeof activeLinkValue === "object"
			? (activeLinkValue as { href: string; title?: string })
			: null;
	const showRemoveButton = activeLink !== null;

	const openPopover = () => {
		if (!canOpenLinkEditor(editor)) return;
		setUrl(getActiveLinkMark(editor)?.href ?? "");
		setIsPopoverOpen(true);
	};

	const closePopover = () => {
		setIsPopoverOpen(false);
		setUrl("");
	};

	const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		openPopover();
	};

	const applyLink = () => {
		const trimmed = url.trim();
		if (!trimmed) return;
		setInlineMark(editor, "link", { href: trimmed });
		closePopover();
	};

	const removeLink = () => {
		removeLinkMark(editor);
		closePopover();
	};

	const handleInputKeyDown = (event: ReactKeyboardEvent) => {
		event.stopPropagation();

		if (event.key === "Enter") {
			event.preventDefault();
			applyLink();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			closePopover();
		}
	};

	const stopEditorPropagation = (
		event:
			| ReactKeyboardEvent<HTMLInputElement>
			| FormEvent<HTMLInputElement>
			| MouseEvent<HTMLInputElement>,
	) => {
		event.stopPropagation();
	};

	useEffect(() => {
		linkToggleRef.current = openPopover;

		return () => {
			if (linkToggleRef.current === openPopover) {
				linkToggleRef.current = null;
			}
		};
	}, [linkToggleRef, openPopover]);

	useEffect(() => {
		if (!isPopoverOpen) return;

		requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});

		const handlePointerDown = (event: PointerEvent) => {
			if (!popoverRef.current?.contains(event.target as Node)) {
				closePopover();
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closePopover();
			}
		};

		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isPopoverOpen]);

	return (
		<div className="toolbar-link-wrapper" ref={popoverRef}>
			<button
				data-pen-toolbar-toggle=""
				data-active={showRemoveButton || undefined}
				onMouseDown={handleMouseDown}
				type="button"
				title="Link (⌘K)"
				aria-label="Toggle link"
			>
				<IconChain className="toolbar-icon" />
			</button>
			{isPopoverOpen && (
				<div className="toolbar-link-popover">
					<input
						ref={inputRef}
						className="toolbar-link-input"
						type="url"
						placeholder="Paste or type a URL..."
						value={url}
						onMouseDown={stopEditorPropagation}
						onChange={(e) => setUrl(e.target.value)}
						onBeforeInput={stopEditorPropagation}
						onKeyDown={handleInputKeyDown}
					/>
					{showRemoveButton && (
						<button
							className="toolbar-link-remove"
							type="button"
							onMouseDown={preventEditorBlur}
							onClick={removeLink}
						>
							Remove
						</button>
					)}
					<button
						className="toolbar-link-apply"
						type="button"
						onMouseDown={preventEditorBlur}
						onClick={applyLink}
					>
						Apply
					</button>
				</div>
			)}
		</div>
	);
}

// ── Export menu ──────────────────────────────────────────────

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

function getCollaborationStatusLabel(status: string): string {
	switch (status) {
		case "connected":
			return "Live";
		case "syncing":
			return "Syncing";
		case "connecting":
			return "Connecting";
		case "error":
			return "Error";
		default:
			return "Offline";
	}
}

function getCollaborationStatusTone(status: string): string {
	switch (status) {
		case "connected":
			return "success";
		case "syncing":
			return "active";
		case "connecting":
			return "pending";
		case "error":
			return "danger";
		default:
			return "muted";
	}
}

function getInitials(name: string): string {
	const parts = name
		.split(" ")
		.map((part) => part.trim())
		.filter(Boolean)
		.slice(0, 2);

	if (parts.length === 0) {
		return "?";
	}

	return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function preventEditorBlur(event: MouseEvent<HTMLElement>) {
	event.preventDefault();
}
