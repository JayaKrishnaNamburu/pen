import { getSearchController } from "@pen/search";
import { Pen, useSearch } from "@pen/react";
import type { Editor } from "@pen/types";
import {
	useEffect,
	useRef,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { preventEditorBlur } from "./ToolbarUtils";

type SearchMenuProps = {
	editor: Editor;
};

export function SearchMenu({ editor }: SearchMenuProps) {
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
			<div
				className="toolbar-menu toolbar-search-menu"
				ref={searchMenuRef}
			>
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
					<div
						className="toolbar-search-popover"
						role="dialog"
						aria-label="Find in document"
					>
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
