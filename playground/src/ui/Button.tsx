import type { ComponentPropsWithoutRef } from "react";
import { Tooltip } from "./Tooltip";

type ButtonKind =
	| "primary"
	| "secondary"
	| "tertiary"
	| "faded"
	| "transparent";

/** Input's scale runs xs/sm/md/lg (22/28/36/44px). The playground uses two. */
type ButtonSize = "sm" | "md";

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
	kind?: ButtonKind;
	size?: ButtonSize;
	/** Pill by default, like Input. `rounded` swaps to a squarer radius. */
	shape?: "pill" | "rounded";
	/** One icon, no label: width follows height. */
	square?: boolean;
	stretch?: boolean;
	/** Held down — a toolbar toggle whose mark is on, or a sheet held open. */
	active?: boolean;
	/**
	 * The feature this button controls is on — collaboration is live, a
	 * reminder is set. Input keeps this separate from the held state and shows
	 * it as a glyph colour rather than a fill, so "on" cannot be mistaken for
	 * "focused". Input picks the colour per feature (`enabledColor`, yellow by
	 * default); the playground has one.
	 */
	enabled?: boolean;
}

/**
 * The button, ported from Input's `ButtonCore`.
 *
 * Five kinds, which is every button this app has. `primary` is the default and
 * the workhorse — a tinted fill with a hairline. `secondary` is the solid ink
 * one you use once per screen. `tertiary` is transparent but raised, `faded` is
 * quieter than primary, and `transparent` is the chrome icon button whose fill
 * grows in on hover.
 *
 * Input's version is 620 lines: fifteen kinds, a keybinding registry, hold and
 * split variants, loading states, and a liquid-glass mode. What survives here is
 * the geometry and the token wiring, which is what you see.
 *
 * It renders a real `<button>` — Input renders a focusable `<div>` — because
 * Pen's toolbar primitives drive this through `asChild`, handing it `onClick`,
 * `data-active`, and `aria-pressed` and expecting them to land.
 */
function ButtonCore({
	kind = "primary",
	size = "md",
	shape = "pill",
	square = false,
	stretch = false,
	active = false,
	enabled = false,
	className,
	...buttonProps
}: ButtonProps) {
	const classNames = ["button", `button-${kind}`, `button-${size}`];
	if (shape === "rounded") {
		classNames.push("button-rounded");
	}
	if (square) {
		classNames.push("button-square");
	}
	if (stretch) {
		classNames.push("button-stretch");
	}
	if (className) {
		classNames.push(className);
	}

	return (
		<button
			type="button"
			className={classNames.join(" ")}
			data-active={active || undefined}
			data-enabled={enabled || undefined}
			{...buttonProps}
		/>
	);
}

interface ButtonIconProps extends Omit<ButtonProps, "square" | "stretch"> {
	/**
	 * The accessible name. Input's icon buttons get theirs from the tooltip;
	 * a real `<button>` needs it spelled out.
	 */
	label: string;
}

/** A square button holding one icon. Wrap it in `Button.Tooltip`. */
function ButtonIcon({
	label,
	kind = "transparent",
	size = "sm",
	...buttonProps
}: ButtonIconProps) {
	return (
		<ButtonCore
			aria-label={label}
			kind={kind}
			size={size}
			square
			{...buttonProps}
		/>
	);
}

/**
 * Input's compound: `Button`, `Button.Icon`, `Button.Tooltip`. Call sites read
 * the same here as they do there, which is the point of keeping the shape.
 */
export const Button = Object.assign(ButtonCore, {
	Icon: ButtonIcon,
	Tooltip,
});
