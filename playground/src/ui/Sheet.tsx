import { useEffect, type ReactNode } from "react";
import { IconButton } from "./IconButton";
import { IconClose } from "./Icon";

interface SheetProps {
	title: string;
	isOpen: boolean;
	onClose: () => void;
	children: ReactNode;
}

/**
 * A panel that slides in from the right edge.
 *
 * It deliberately has no backdrop and does not trap focus — you keep editing
 * while it is open, which is the whole point of watching document state, so it
 * is a complementary region rather than a dialog. `inert` keeps it out of the
 * tab order while closed.
 */
export function Sheet({ title, isOpen, onClose, children }: SheetProps) {
	useEffect(() => {
		if (!isOpen) {
			return;
		}

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [isOpen, onClose]);

	return (
		<aside
			className="sheet"
			aria-label={title}
			data-open={isOpen || undefined}
			inert={!isOpen}
		>
			<div className="sheet-header">
				<h2 className="sheet-title">{title}</h2>
				<IconButton label="Close panel" onClick={onClose}>
					<IconClose />
				</IconButton>
			</div>
			<div className="sheet-body">{children}</div>
		</aside>
	);
}
