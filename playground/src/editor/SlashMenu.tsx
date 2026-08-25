import { Pen } from "@input/pen-react";
import type { Editor } from "@input/pen-types";

/**
 * The menu that opens when you type `/`.
 *
 * There is no item list here on purpose: given no children, `List` builds
 * itself from the block types in the editor's schema, grouped and filtered by
 * whatever you type after the slash. Register a block, get a menu entry.
 *
 * Styling hangs off the `data-pen-slash-menu-*` attributes in `editor.css`.
 */
export function SlashMenu({ editor }: { editor: Editor }) {
	return (
		<Pen.SlashMenu.Root editor={editor}>
			<Pen.SlashMenu.Content>
				<Pen.SlashMenu.List />
				<Pen.SlashMenu.Empty>No matching blocks</Pen.SlashMenu.Empty>
			</Pen.SlashMenu.Content>
		</Pen.SlashMenu.Root>
	);
}
