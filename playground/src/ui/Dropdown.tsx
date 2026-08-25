import {
	useEffect,
	useRef,
	type MouseEvent,
	type ReactNode,
} from "react";

interface DropdownProps {
	children: ReactNode;
	content: ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	align?: "start" | "end";
	width?: number;
}

/**
 * Input's `Dropdown`, without Radix.
 *
 * Trigger plus a popover of items. Same geometry as the select menu: popover
 * surface, 30px rows, 5px gap. Closing is outside click or Escape.
 */
export function Dropdown({
	children,
	content,
	open,
	onOpenChange,
	align = "start",
	width,
}: DropdownProps) {
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}

		const closeOnOutside = (event: Event) => {
			if (
				event.target instanceof Node &&
				!rootRef.current?.contains(event.target)
			) {
				onOpenChange(false);
			}
		};

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onOpenChange(false);
			}
		};

		document.addEventListener("mousedown", closeOnOutside);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("mousedown", closeOnOutside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [onOpenChange, open]);

	return (
		<div
			ref={rootRef}
			className="dropdown"
			data-open={open || undefined}
			data-align={align}
		>
			{children}
			{open ? (
				<div
					className="dropdown-menu"
					role="menu"
					style={width ? { width } : undefined}
				>
					{content}
				</div>
			) : null}
		</div>
	);
}

interface DropdownItemProps {
	children: ReactNode;
	onClick?: () => void;
}

function DropdownItem({ children, onClick }: DropdownItemProps) {
	return (
		<button
			type="button"
			role="menuitem"
			className="dropdown-item"
			onMouseDown={keepFocus}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function keepFocus(event: MouseEvent) {
	event.preventDefault();
}

Dropdown.Item = DropdownItem;
