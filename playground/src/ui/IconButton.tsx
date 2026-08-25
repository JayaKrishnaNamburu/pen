import type { ReactNode } from "react";

interface IconButtonProps {
	label: string;
	children: ReactNode;
	onClick?: () => void;
	isActive?: boolean;
	isDisabled?: boolean;
	/**
	 * Keeps DOM focus in the editor on press. Toolbar buttons need this so the
	 * caret stays visible while you format text.
	 */
	keepsEditorFocus?: boolean;
}

export function IconButton({
	label,
	children,
	onClick,
	isActive = false,
	isDisabled = false,
	keepsEditorFocus = false,
}: IconButtonProps) {
	return (
		<button
			type="button"
			className="icon-button"
			title={label}
			aria-label={label}
			aria-pressed={isActive}
			disabled={isDisabled}
			data-active={isActive || undefined}
			onMouseDown={
				keepsEditorFocus ? (event) => event.preventDefault() : undefined
			}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
