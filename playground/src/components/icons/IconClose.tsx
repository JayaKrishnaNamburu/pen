import type { IconProps } from "./types";

export function IconClose({
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
				d="M 9.828 3.111 C 10.121 2.818 10.596 2.818 10.889 3.111 C 11.182 3.404 11.182 3.879 10.889 4.172 L 8.061 7 L 10.889 9.828 C 11.182 10.121 11.182 10.596 10.889 10.889 C 10.596 11.182 10.121 11.182 9.828 10.889 L 7 8.061 L 4.172 10.889 C 3.879 11.182 3.404 11.182 3.111 10.889 C 2.818 10.596 2.818 10.121 3.111 9.828 L 5.939 7 L 3.111 4.172 C 2.818 3.879 2.818 3.404 3.111 3.111 C 3.404 2.818 3.879 2.818 4.172 3.111 L 7 5.939 Z"
				fill={color}
			/>
		</svg>
	);
}
