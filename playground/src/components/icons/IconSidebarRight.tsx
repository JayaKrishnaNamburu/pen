import type { IconProps } from "./types";

export function IconSidebarRight({
	size = 14,
	color = "currentColor",
	className,
}: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 14 14"
			className={className}
		>
			<path
				d="M 0 3.5 C 0 1.567 1.567 0 3.5 0 L 10.5 0 C 12.433 0 14 1.567 14 3.5 L 14 10.5 C 14 12.433 12.433 14 10.5 14 L 3.5 14 C 1.567 14 0 12.433 0 10.5 Z M 1.5 10.5 C 1.5 11.605 2.395 12.5 3.5 12.5 L 7.5 12.5 L 7.5 1.5 L 3.5 1.5 C 2.395 1.5 1.5 2.395 1.5 3.5 Z M 10.5 12.5 C 11.605 12.5 12.5 11.605 12.5 10.5 L 12.5 3.5 C 12.5 2.395 11.605 1.5 10.5 1.5 L 9 1.5 L 9 12.5 Z"
				fill={color}
			/>
		</svg>
	);
}
