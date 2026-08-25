import type { ReactNode } from "react";

interface TooltipProps {
	children: ReactNode;
	content: string;
	/**
	 * A Pen key binding, written the way the keymap writes it: `Shift-Mod-z`.
	 * Input looks its shortcuts up from a binding registry by id; Pen has no
	 * such registry, so the binding string is quoted directly.
	 */
	shortcut?: string;
	side?: "top" | "bottom" | "left" | "right";
	/** Hide the hover label while a menu over the same trigger is open. */
	disabled?: boolean;
}

/**
 * A hover label, ported from Input's `Tooltip`.
 *
 * Input's is a Radix popper with collision handling, an arrow, six animations,
 * and lazy mounting — it renders thousands of these in a list, so the trigger
 * stays alone until first hover. This one is a positioned span that CSS reveals
 * on hover or keyboard focus: no library, no portal, no state. It keeps the
 * look, which is the blurred `--tooltip-background`, the popover shadow, and the
 * scale-from-nothing entrance.
 *
 * It is `aria-hidden` on purpose. The trigger already carries the same words as
 * its accessible name, and announcing them twice is worse than not at all.
 */
export function Tooltip({
	children,
	content,
	shortcut,
	side = "bottom",
	disabled = false,
}: TooltipProps) {
	return (
		<span className="tooltip-anchor" data-disabled={disabled || undefined}>
			{children}
			<span className="tooltip" data-side={side} aria-hidden="true">
				{content}
				{shortcut ? (
					<span className="tooltip-shortcut">
						{formatShortcut(shortcut)}
					</span>
				) : null}
			</span>
		</span>
	);
}

/** `Mod` is Cmd on Apple keyboards and Ctrl everywhere else. */
const IS_APPLE = /Mac|iPhone|iPad/.test(navigator.userAgent);

const KEY_SYMBOLS: Record<string, string> = {
	mod: IS_APPLE ? "⌘" : "Ctrl",
	meta: "⌘",
	ctrl: "⌃",
	alt: IS_APPLE ? "⌥" : "Alt",
	shift: "⇧",
	enter: "↵",
	backspace: "⌫",
	escape: "⎋",
	tab: "⇥",
};

/**
 * Turns a key binding into the glyphs a keyboard shows: `Shift-Mod-z` → `⇧⌘Z`.
 *
 * Input's formatter is the same substitution table, minus the platform check —
 * it is a Mac-first app and always prints `⌘`.
 */
function formatShortcut(shortcut: string): string {
	return shortcut
		.split(/[+-]/)
		.map((key) => KEY_SYMBOLS[key.toLowerCase()] ?? key.toUpperCase())
		.join("");
}
