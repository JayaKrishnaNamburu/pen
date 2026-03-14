import "./SelectionToolbar.css";
import { Pen } from "@pen/react";
import {
	IconBold,
	IconCode,
	IconItalic,
	IconStrikethrough,
	IconUnderline,
} from "./icons";

const INLINE_EDIT_SHORTCUT = "mod+j";

export function SelectionToolbar() {
	return (
		<Pen.SelectionToolbar.Root>
			<Pen.SelectionToolbar.Content>
				<Pen.Toolbar.Group>
					<Pen.AI.SelectionTrigger asChild shortcut={INLINE_EDIT_SHORTCUT}>
						<button type="button" className="selection-toolbar-ai-button">
							<span>AI</span>
						</button>
					</Pen.AI.SelectionTrigger>
					<Pen.Toolbar.Toggle format="bold">
						<IconBold className="selection-toolbar-icon" />
					</Pen.Toolbar.Toggle>
					<Pen.Toolbar.Toggle format="italic">
						<IconItalic className="selection-toolbar-icon" />
					</Pen.Toolbar.Toggle>
					<Pen.Toolbar.Toggle format="underline">
						<IconUnderline className="selection-toolbar-icon" />
					</Pen.Toolbar.Toggle>
					<Pen.Toolbar.Toggle format="strikethrough">
						<IconStrikethrough className="selection-toolbar-icon" />
					</Pen.Toolbar.Toggle>
					<Pen.Toolbar.Toggle format="code">
						<IconCode className="selection-toolbar-icon" />
					</Pen.Toolbar.Toggle>
				</Pen.Toolbar.Group>
			</Pen.SelectionToolbar.Content>
		</Pen.SelectionToolbar.Root>
	);
}
