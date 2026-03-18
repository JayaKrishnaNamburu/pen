import "./Toolbar.css";
import type { Editor } from "@pen/types";
import type { PeerState } from "@pen/multiplayer";
import { htmlExporter } from "@pen/export-html";
import { markdownExporter } from "@pen/export-markdown";
import { getSearchController } from "@pen/search";
import { setInlineMark } from "@pen/shortcuts";
import { Pen, useMultiplayer, useSearch, useToolbar } from "@pen/react";
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
	onStartFreshRoom?: () => void;
};

export function Toolbar({
	editor,
	linkToggleRef,
	collaboration = null,
	interactionModel = "content-first",
	onToggleInteractionModel,
	onStartFreshRoom,
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
				{onStartFreshRoom ? (
					<button
						className="toolbar-mode-toggle"
						onMouseDown={preventEditorBlur}
						onClick={onStartFreshRoom}
						type="button"
						title="Open a clean collaboration room"
						aria-label="Open a fresh collaboration room"
					>
						Fresh room
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

				<SearchMenu editor={editor} />

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
	const { visiblePeers, overflowCount } = getVisiblePresencePeers(
		multiplayerState.peers,
		4,
	);
	const peerAvatarItems = visiblePeers.map((peer) => (
		<span
			key={getPeerPresenceKey(peer)}
			className="toolbar-collaboration-avatar"
			data-pen-multiplayer-presence-avatar=""
			data-user-id={peer.user.id}
			data-user-name={peer.user.name}
			data-user-color={peer.user.color}
			style={{
				backgroundColor: peer.user.color ?? "var(--accent)",
			}}
			title={peer.user.name}
		>
			{getInitials(peer.user.name)}
		</span>
	));
	const overflowItem =
		overflowCount > 0 ? (
			<span data-pen-multiplayer-presence-overflow="">+{overflowCount}</span>
		) : null;

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
			<div
				className="toolbar-collaboration-peers"
				data-pen-multiplayer-presence-list=""
				data-overflow-count={overflowCount}
				title={`Room: ${room}`}
			>
				{peerAvatarItems}
				{overflowItem}
			</div>
		</div>
	);
}

function getVisiblePresencePeers(
	peers: readonly PeerState[],
	maxVisible: number,
): {
	visiblePeers: readonly PeerState[];
	overflowCount: number;
} {
	const dedupedPeers = dedupePeersByIdentity(peers);
	return {
		visiblePeers: dedupedPeers.slice(0, maxVisible),
		overflowCount: Math.max(0, dedupedPeers.length - maxVisible),
	};
}

function dedupePeersByIdentity(peers: readonly PeerState[]): PeerState[] {
	const seenKeys = new Set<string>();
	const dedupedPeers: PeerState[] = [];

	for (const peer of peers) {
		const key = getPeerPresenceKey(peer);
		if (seenKeys.has(key)) {
			continue;
		}

		seenKeys.add(key);
		dedupedPeers.push(peer);
	}

	return dedupedPeers;
}

function getPeerPresenceKey(peer: PeerState): string {
	const normalizedName = peer.user.name.trim().toLowerCase();
	if (normalizedName) {
		return `name:${normalizedName}`;
	}

	return `id:${peer.user.id}`;
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

type SearchMenuProps = {
	editor: Editor;
};

function SearchMenu({ editor }: SearchMenuProps) {
	const searchMenuRef = useRef<HTMLDivElement | null>(null);
	const searchState = useSearch(editor);
	const searchController = getSearchController(editor);
	const isSearchMenuOpen = searchState.open;

	const handleSearchFieldKeyDown = (
		event: ReactKeyboardEvent<HTMLInputElement>,
	) => {
		if (event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			if (event.shiftKey) {
				searchController?.previous();
			} else {
				searchController?.next();
			}
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			searchController?.close();
			return;
		}

		event.stopPropagation();
	};

	useEffect(() => {
		if (!isSearchMenuOpen) {
			return;
		}

		requestAnimationFrame(() => {
			const searchInput = searchMenuRef.current?.querySelector(
				".toolbar-search-input",
			) as HTMLInputElement | null;
			searchInput?.focus();
			searchInput?.select();
		});

		const handlePointerDown = (event: PointerEvent) => {
			if (!searchMenuRef.current?.contains(event.target as Node)) {
				searchController?.close();
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				searchController?.close();
			}
		};

		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [isSearchMenuOpen, searchController]);

	return (
		<Pen.Search.Root editor={editor}>
			<div className="toolbar-menu toolbar-search-menu" ref={searchMenuRef}>
				<button
					className="toolbar-button"
					type="button"
					title="Find"
					aria-label="Find"
					aria-haspopup="dialog"
					aria-expanded={isSearchMenuOpen}
					data-active={isSearchMenuOpen || undefined}
					onMouseDown={preventEditorBlur}
					onClick={() => searchController?.toggleOpen()}
				>
					Find
				</button>

				{isSearchMenuOpen ? (
					<div className="toolbar-search-popover" role="dialog" aria-label="Find in document">
						<div className="toolbar-search-row">
							<Pen.Search.Input
								className="toolbar-search-input"
								placeholder="Find in document..."
								onKeyDown={handleSearchFieldKeyDown}
							/>
							<Pen.Search.Results className="toolbar-search-results" />
						</div>

						<div className="toolbar-search-row">
							<Pen.Search.Previous
								className="toolbar-search-action"
								onMouseDown={preventEditorBlur}
							>
								Prev
							</Pen.Search.Previous>
							<Pen.Search.Next
								className="toolbar-search-action"
								onMouseDown={preventEditorBlur}
							>
								Next
							</Pen.Search.Next>
							<Pen.Search.CaseSensitive
								className="toolbar-search-toggle"
								onMouseDown={preventEditorBlur}
							>
								Aa
							</Pen.Search.CaseSensitive>
							<Pen.Search.WholeWord
								className="toolbar-search-toggle"
								onMouseDown={preventEditorBlur}
							>
								Word
							</Pen.Search.WholeWord>
							<Pen.Search.RegExp
								className="toolbar-search-toggle"
								onMouseDown={preventEditorBlur}
							>
								.*
							</Pen.Search.RegExp>
						</div>

						<div className="toolbar-search-row">
							<Pen.Search.ReplaceInput
								className="toolbar-search-input toolbar-search-replace-input"
								placeholder="Replace with..."
								onKeyDown={handleSearchFieldKeyDown}
							/>
							<Pen.Search.Replace
								className="toolbar-search-action toolbar-search-commit"
								onMouseDown={preventEditorBlur}
							>
								Replace
							</Pen.Search.Replace>
							<Pen.Search.ReplaceAll
								className="toolbar-search-action toolbar-search-commit"
								onMouseDown={preventEditorBlur}
							>
								All
							</Pen.Search.ReplaceAll>
						</div>
					</div>
				) : null}
			</div>
		</Pen.Search.Root>
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
