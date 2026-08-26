import type {
	Extension,
	KeyBinding,
} from "@input/pen-types";
import { shortcutsToKeymapProviders } from "./providers";
import { toggleInlineMark, setInlineMark } from "./toggleInlineMark";

/** Extension name under which the rich-text shortcuts register. */
export const RICH_TEXT_SHORTCUTS_EXTENSION_NAME = "rich-text-shortcuts";

type ShortcutMark = "bold" | "italic" | "underline";

/**
 * Host configuration for {@link richTextShortcutsExtension}.
 *
 * `bindings` overrides the default key for a mark; passing `null` or an
 * empty array for a mark unbinds it rather than restoring the default,
 * which is how a host suppresses a shortcut it handles itself.
 * `onToggleLink` opts into `Mod-k`: linking needs a URL the editor
 * cannot invent, so the extension binds the key only when the host
 * supplies a handler.
 */
export interface RichTextShortcutsOptions {
	bindings?: Partial<Record<ShortcutMark, readonly string[] | null>>;
	onToggleLink?: (editor: Parameters<typeof setInlineMark>[0]) => boolean;
}

const DEFAULT_BINDINGS: Record<ShortcutMark, readonly string[]> = {
	bold: ["Mod-b"], // pen.toggleMark { mark: "bold" }
	italic: ["Mod-i"], // pen.toggleMark { mark: "italic" }
	underline: ["Mod-u"], // pen.toggleMark { mark: "underline" }
};

const BINDING_DESCRIPTIONS: Record<ShortcutMark, string> = {
	bold: "Toggle bold formatting",
	italic: "Toggle italic formatting",
	underline: "Toggle underline formatting",
};

/**
 * Bind the standard rich-text formatting shortcuts — `Mod-b` bold,
 * `Mod-i` italic, `Mod-u` underline, and `Mod-k` when the host supplies
 * `onToggleLink`. The bindings are contributed through the keymap facet,
 * so a host keymap at a higher precedence still wins.
 */
export function richTextShortcutsExtension(
	options: RichTextShortcutsOptions = {},
): Extension {
	return {
		name: RICH_TEXT_SHORTCUTS_EXTENSION_NAME,
		version: "0.0.0",
		facets: shortcutsToKeymapProviders(buildKeyBindings(options)),
	};
}

function buildKeyBindings(
	options: RichTextShortcutsOptions,
): readonly KeyBinding[] {
	const configuredBindings = {
		...DEFAULT_BINDINGS,
		...options.bindings,
	};
	const keyBindings: KeyBinding[] = [];

	for (const markType of Object.keys(DEFAULT_BINDINGS) as ShortcutMark[]) {
		const keys = configuredBindings[markType];
		if (!keys || keys.length === 0) continue;

		for (const key of keys) {
			keyBindings.push({
				key,
				priority: 100,
				description: BINDING_DESCRIPTIONS[markType],
				handler: (editor) => toggleInlineMark(editor, markType),
			});
		}
	}

	if (options.onToggleLink) {
		const onToggleLink = options.onToggleLink;
		keyBindings.push({
			key: "Mod-k", // unmapped: host onToggleLink; no catalog command
			priority: 100,
			description: "Toggle link",
			handler: (editor) => onToggleLink(editor),
		});
	}

	return keyBindings;
}
