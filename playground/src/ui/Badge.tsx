import type { ReactNode } from "react";

interface BadgeProps {
	children: ReactNode;
	/** Drawn as both the text and the border, the way Input's badge is. */
	color?: string;
}

/** A small outlined pill, ported from Input's `Badge`. */
export function Badge({ children, color }: BadgeProps) {
	return (
		<span className="badge" style={{ color }}>
			{children}
		</span>
	);
}
