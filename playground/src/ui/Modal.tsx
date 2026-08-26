import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

interface ModalProps {
	open: boolean;
	title: string;
	onClose: () => void;
	children: ReactNode;
}

/**
 * A small dialog over a dimmed page, ported from Input's modal surface.
 *
 * Input's is a Radix dialog with focus trap, size variants, and a stack.
 * This one is a single card: Escape or the backdrop closes it.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
	useEffect(() => {
		if (!open) {
			return;
		}

		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("keydown", closeOnEscape);
		return () => document.removeEventListener("keydown", closeOnEscape);
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<div className="modal-backdrop" onMouseDown={onClose}>
			<div
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className="modal-bar">
					<h2 id="modal-title">{title}</h2>
					<Button.Icon label="Close" onClick={onClose}>
						<Icon.Close />
					</Button.Icon>
				</div>
				{children}
			</div>
		</div>
	);
}
