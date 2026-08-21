import { resolveDirectedCommand } from "@input/pen-core";
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
 * Standalone keymap resolver (K1, K4, M2). Matches bindings in the given
 * order and returns the first command name, or null. Direction remaps the
 * matched command after the key match (M2) so other bindings on that key
 * stay intact. Does not attach listeners or dispatch.
 */
export function resolveKeymap(
	bindings: readonly KeymapBinding[],
	event: KeymapEvent,
	options: ResolveKeymapOptions,
): string | null {
	if (options.composing && event.key !== "Escape") {
		return null;
	}

	for (const binding of bindings) {
		if (matchesKey(binding.key, event)) {
			const command = resolveDirectedCommand(
				binding.command,
				options.direction ?? "ltr",
			);
			return command.name;
		}
	}

	return null;
}

function matchesKey(pattern: string, event: KeymapEvent): boolean {
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
		event.key.toLowerCase() === key
	);
}
