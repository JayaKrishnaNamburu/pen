import "./SlashMenu.css";
import { Pen } from "@pen/react";

export function SlashMenu() {
	return (
		<Pen.SlashMenu.Root>
			<Pen.SlashMenu.Input />
			<Pen.SlashMenu.List />
		</Pen.SlashMenu.Root>
	);
}
