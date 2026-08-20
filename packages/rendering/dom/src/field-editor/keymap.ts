import type { Command } from "@input/pen-types";

export type KeymapDirection = "ltr" | "rtl";

export interface KeymapBinding {
	readonly key: string;
	readonly command: Command<unknown>;
}

export interface KeymapEvent {
	readonly key: string;
	readonly altKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly metaKey?: boolean;
	readonly shiftKey?: boolean;
}

export interface ResolveKeymapOptions {
	readonly composing: boolean;
	readonly direction?: KeymapDirection;
}

/**
 * Standalone Wave 4.3 keymap resolver (K1, K4). Matches bindings in the
 * given order and returns the first command name, or null. Does not attach
 * listeners or dispatch.
 */
export function resolveKeymap(
	bindings: readonly KeymapBinding[],
	event: KeymapEvent,
	options: ResolveKeymapOptions,
): string | null {
	if (options.composing && event.key !== "Escape") {
		return null;
	}

	const resolvedKey = resolveDirectedKey(event.key, options.direction);

	for (const binding of bindings) {
		if (matchesKey(binding.key, event, resolvedKey)) {
			return binding.command.name;
		}
	}

	return null;
}

function resolveDirectedKey(
	key: string,
	_direction?: KeymapDirection,
): string {
	// wave-6
	return key;
}

function matchesKey(
	pattern: string,
	event: KeymapEvent,
	resolvedKey: string,
): boolean {
	const parts = pattern.split("-").map((part) => part.toLowerCase());
	const key = parts.pop()?.toLowerCase() ?? "";

	const needsCtrl = parts.includes("ctrl");
	const needsMeta = parts.includes("meta");
	const needsMod = parts.includes("mod");
	const needsShift = parts.includes("shift");
	const needsAlt = parts.includes("alt");

	const isMac =
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.platform ?? "");

	const allowCtrl = needsCtrl || (needsMod && !isMac);
	const allowMeta = needsMeta || (needsMod && isMac);
	const ctrlKey = event.ctrlKey === true;
	const metaKey = event.metaKey === true;
	const shiftKey = event.shiftKey === true;
	const altKey = event.altKey === true;

	const modMatch = needsMod ? (isMac ? metaKey : ctrlKey) : true;
	const ctrlMatch = allowCtrl ? ctrlKey : !ctrlKey;
	const metaMatch = allowMeta ? metaKey : !metaKey;
	const shiftMatch = needsShift ? shiftKey : !shiftKey;
	const altMatch = needsAlt ? altKey : !altKey;

	return (
		modMatch &&
		ctrlMatch &&
		metaMatch &&
		shiftMatch &&
		altMatch &&
		resolvedKey.toLowerCase() === key
	);
}
