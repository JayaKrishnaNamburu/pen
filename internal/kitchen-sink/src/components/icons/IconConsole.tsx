import type { IconProps } from "./types";

export function IconConsole({
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
				d="M 1.207 2 L 6 7 L 1.207 12"
				fill="transparent"
				strokeWidth="1.5"
				stroke={color}
				strokeLinecap="round"
				strokeMiterlimit="10"
			/>
			<path
				d="M 6.707 11.75 C 6.707 11.336 7.043 11 7.457 11 L 12.957 11 C 13.371 11 13.707 11.336 13.707 11.75 L 13.707 11.75 C 13.707 12.164 13.371 12.5 12.957 12.5 L 7.457 12.5 C 7.043 12.5 6.707 12.164 6.707 11.75 Z"
				fill={color}
			/>
		</svg>
	);
}
