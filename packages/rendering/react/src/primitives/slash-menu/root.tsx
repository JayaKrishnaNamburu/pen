import React, { createContext, useContext, useEffect } from "react";
import { useEditorContext } from "../../context/editorContext";
import {
	useSlashMenu,
	type SlashMenuState,
	type SlashMenuActions,
} from "../../hooks/useSlashMenu";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { isDevelopmentEnvironment } from "../../utils/environment";

type SlashMenuContextValue = SlashMenuState & SlashMenuActions;

const SlashMenuContext = createContext<SlashMenuContextValue | null>(null);

export function useSlashMenuContext(): SlashMenuContextValue {
	const ctx = useContext(SlashMenuContext);
	if (!ctx) {
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: useSlashMenuContext must be used within <Pen.SlashMenu.Root>.",
			);
		}
		throw new Error("Missing Pen.SlashMenu.Root context");
	}
	return ctx;
}

export interface SlashMenuRootProps extends AsChildProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	ref?: React.Ref<HTMLElement>;
}

export function SlashMenuRoot(props: SlashMenuRootProps) {
	const { open: controlledOpen, onOpenChange, ...rest } = props;
	const { editor } = useEditorContext();
	const menuState = useSlashMenu(editor);

	const isOpen = controlledOpen ?? menuState.open;

	const wrappedState: SlashMenuContextValue = {
		...menuState,
		dismiss: () => {
			menuState.dismiss();
			onOpenChange?.(false);
		},
		confirm: () => {
			menuState.confirm();
			onOpenChange?.(false);
		},
	};

	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					wrappedState.select(
						Math.min(
							wrappedState.selectedIndex + 1,
							wrappedState.items.length - 1,
						),
					);
					break;
				case "ArrowUp":
					event.preventDefault();
					wrappedState.select(
						Math.max(wrappedState.selectedIndex - 1, 0),
					);
					break;
				case "Enter":
					event.preventDefault();
					wrappedState.confirm();
					break;
				case "Escape":
					event.preventDefault();
					wrappedState.dismiss();
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown, true);
		return () =>
			document.removeEventListener("keydown", handleKeyDown, true);
	});

	const primitiveProps: Record<string, unknown> = {
		role: "listbox",
		"data-pen-slash-menu": "",
		"data-open": isOpen || undefined,
	};

	return (
		<SlashMenuContext.Provider value={wrappedState}>
			{renderAsChild(rest, "div", primitiveProps)}
		</SlashMenuContext.Provider>
	);
}

export { SlashMenuContext };
