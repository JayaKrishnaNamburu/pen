/**
 * Every icon the playground uses, on a 14x14 grid, drawn in `currentColor`.
 * Inline SVG keeps the app dependency-free — there is no icon package.
 */

interface IconProps {
	size?: number;
}

function Svg({ size = 14, children }: IconProps & { children: React.ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 14 14"
			fill="none"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

const STROKE = {
	stroke: "currentColor",
	strokeWidth: 1.5,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const;

export function IconBold(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 3.75 7 L 3.75 2 L 7.5 2 A 2.5 2.5 0 0 1 7.5 7 Z" {...STROKE} />
			<path d="M 3.75 7 L 8.25 7 A 2.5 2.5 0 0 1 8.25 12 L 3.75 12 Z" {...STROKE} />
		</Svg>
	);
}

export function IconItalic(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 5.5 2 L 11 2 M 3 12 L 8.5 12 M 8.75 2 L 5.25 12" {...STROKE} />
		</Svg>
	);
}

export function IconUnderline(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 3.5 1.75 L 3.5 6.5 A 3.5 3.5 0 0 0 10.5 6.5 L 10.5 1.75" {...STROKE} />
			<path d="M 2.5 12.25 L 11.5 12.25" {...STROKE} />
		</Svg>
	);
}

export function IconStrikethrough(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 10.5 3.5 A 3 2.25 0 0 0 4 4.25 C 4 6.5 10 6.25 10 9.5 A 3 2.25 0 0 1 3.5 10.25" {...STROKE} />
			<path d="M 1.75 7 L 12.25 7" {...STROKE} />
		</Svg>
	);
}

export function IconCode(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 4.5 2.5 L 1 7 L 4.5 11.5" {...STROKE} />
			<path d="M 9.5 2.5 L 13 7 L 9.5 11.5" {...STROKE} />
		</Svg>
	);
}

export function IconUndo(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 2 4 L 2 8 L 6 8" {...STROKE} />
			<path d="M 2.75 8 A 4.75 4.75 0 1 1 7.5 12.75" {...STROKE} />
		</Svg>
	);
}

export function IconRedo(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 12 4 L 12 8 L 8 8" {...STROKE} />
			<path d="M 11.25 8 A 4.75 4.75 0 1 0 6.5 12.75" {...STROKE} />
		</Svg>
	);
}

/** Opens the document-state sheet. */
export function IconPanelRight(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="1" y="1.75" width="12" height="10.5" rx="2.5" {...STROKE} />
			<path d="M 9 1.75 L 9 12.25" {...STROKE} />
		</Svg>
	);
}

export function IconClose(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 3.5 3.5 L 10.5 10.5 M 10.5 3.5 L 3.5 10.5" {...STROKE} />
		</Svg>
	);
}

export function IconArrowUp(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 11.5 6 L 7 1.5 L 2.5 6 M 7 2.25 L 7 12.5" {...STROKE} strokeWidth={2} />
		</Svg>
	);
}

export function IconSparkle(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 5.5 1.5 L 6.6 4.4 L 9.5 5.5 L 6.6 6.6 L 5.5 9.5 L 4.4 6.6 L 1.5 5.5 L 4.4 4.4 Z" {...STROKE} />
			<path d="M 10.75 8.5 L 11.35 10.15 L 13 10.75 L 11.35 11.35 L 10.75 13 L 10.15 11.35 L 8.5 10.75 L 10.15 10.15 Z" {...STROKE} />
		</Svg>
	);
}

export function IconChevronRight(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M 5 3 L 9.5 7 L 5 11" {...STROKE} />
		</Svg>
	);
}

export function IconSpinner(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth={1.5} opacity={0.2} />
			<path d="M 7 1.75 A 5.25 5.25 0 0 1 12.25 7" {...STROKE} />
		</Svg>
	);
}
