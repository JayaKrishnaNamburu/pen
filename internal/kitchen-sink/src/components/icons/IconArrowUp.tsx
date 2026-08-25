import type { IconProps } from "./types";

export function IconArrowUp({
	size = 14,
	color = "currentColor",
	className,
}: IconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 14 14"
			className={className}
		>
			<path
				d="M 12 6 L 7 1 L 2 6"
				fill="transparent"
				strokeWidth="2"
				stroke={color}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M 7 2 L 7 12"
				fill="transparent"
				strokeWidth="2"
				stroke={color}
				strokeLinecap="round"
			/>
		</svg>
	);
}
