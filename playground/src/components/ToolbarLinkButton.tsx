import { setInlineMark } from "@pen/shortcuts";
import type { Editor } from "@pen/types";
import { useToolbar } from "@pen/react";
import {
	useEffect,
	useRef,
	useState,
	type FormEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent,
	type RefObject,
} from "react";
import {
	canOpenLinkEditor,
	getActiveLinkMark,
	removeLinkMark,
} from "../utils/linkMarks";
import { IconChain } from "./icons";
import { preventEditorBlur } from "./ToolbarUtils";

type LinkButtonProps = {
	editor: Editor;
	linkToggleRef: RefObject<(() => void) | null>;
};

export function LinkButton({ editor, linkToggleRef }: LinkButtonProps) {
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
