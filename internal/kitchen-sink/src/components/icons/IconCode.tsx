import type { IconProps } from "./types";

export function IconCode({
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
				d="M 4.5 2.5 L 1 7 L 4.5 11.5"
				fill="transparent"
				strokeWidth="1.5"
				stroke={color}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M 9.5 2.5 L 13 7 L 9.5 11.5"
				fill="transparent"
				strokeWidth="1.5"
				stroke={color}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
