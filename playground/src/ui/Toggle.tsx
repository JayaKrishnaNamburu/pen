interface ToggleProps {
	active: boolean;
	label?: string;
	disabled?: boolean;
	onChange: (active: boolean) => void;
}

/**
 * The switch, ported from Input's `Toggle`.
 *
 * Input's version is Emotion, framer-motion springs, and a shared layout id so
 * several toggles can morph. This one is the geometry: a 22×14 track, a 10px
 * knob that travels 8px, and the yellow (light) / purple (dark) fill when it
 * is on. No `large` size, no JSX labels — the playground only needs a named
 * switch.
 */
export function Toggle({ active, label, disabled, onChange }: ToggleProps) {
	const handleClick = () => {
		if (disabled) {
			return;
		}
		onChange(!active);
	};

	return (
		<button
			type="button"
			role="switch"
			className="toggle"
			aria-checked={active}
			disabled={disabled}
			onClick={handleClick}
		>
			{label ? <span className="toggle-label">{label}</span> : null}
			<span className="toggle-track">
				<span className="toggle-knob" />
			</span>
		</button>
	);
}
