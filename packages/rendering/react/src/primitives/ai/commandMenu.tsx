import React, { createContext, useContext, useId, useState } from "react";
import type { AICommandBinding } from "@pen/ai";
import { renderAsChild, type AsChildProps } from "../../utils/asChild";
import { isDevelopmentEnvironment } from "../../utils/environment";
import { useAIContext } from "./root";

interface CommandMenuContextValue {
	filter: string;
	setFilter: (value: string) => void;
	commands: readonly AICommandBinding[];
}

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

function useCommandMenuContext(): CommandMenuContextValue {
	const ctx = useContext(CommandMenuContext);
	if (!ctx) {
		if (isDevelopmentEnvironment()) {
			console.error(
				"Pen: command menu primitives must be used within <Pen.AI.CommandMenu>.",
			);
		}
		throw new Error("Missing command menu context");
	}
	return ctx;
}

export interface AICommandMenuProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AICommandMenu(props: AICommandMenuProps) {
	const { controller, state } = useAIContext();
	const [filter, setFilter] = useState("");
	const commandContext = controller?.getCommandContext();
	const allCommands = controller?.getCommands() ?? [];
	const normalizedFilter = filter.trim().toLowerCase();
	const commands = normalizedFilter.length === 0
		? allCommands
		: allCommands.filter((command) => {
				const haystack = [
					command.label,
					command.description,
					command.group,
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return haystack.includes(normalizedFilter);
			});
	const menuProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		hidden: !state.commandMenuOpen,
	};

	return (
		<CommandMenuContext.Provider value={{ filter, setFilter, commands }}>
			{renderAsChild(
				menuProps,
				"div",
				{
					role: "dialog",
					"aria-label": "AI command menu",
					"data-pen-ai-command-menu": "",
					"data-open": state.commandMenuOpen ? "" : undefined,
					"data-block-id": commandContext?.blockId ?? undefined,
				},
			)}
		</CommandMenuContext.Provider>
	);
}

export interface AICommandInputProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AICommandInput(props: AICommandInputProps) {
	const { filter, setFilter } = useCommandMenuContext();
	const inputId = useId();
	const inputProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...props,
		id: inputId,
		value: filter,
		onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
			setFilter(event.target.value),
	};
	return renderAsChild(
		inputProps,
		"input",
		{
			type: "text",
			placeholder: "Search AI commands",
			"data-pen-ai-command-input": "",
		},
	);
}

export interface AICommandListProps extends AsChildProps {
	ref?: React.Ref<HTMLElement>;
}

export function AICommandList(props: AICommandListProps) {
	const { commands } = useCommandMenuContext();
	const commandItems = commands.map((command) => (
		<AICommandItem key={command.id} command={command} />
	));

	return renderAsChild(
		{
			...props,
			children: commandItems,
		},
		"div",
		{
			role: "listbox",
			"data-pen-ai-command-list": "",
		},
	);
}

export interface AICommandItemProps extends AsChildProps {
	command: AICommandBinding;
	ref?: React.Ref<HTMLElement>;
}

export function AICommandItem(props: AICommandItemProps) {
	const { command, ...rest } = props;
	const { controller } = useAIContext();
	const itemProps: AsChildProps & {
		ref?: React.Ref<HTMLElement>;
	} & Record<string, unknown> = {
		...rest,
		onClick: () => {
			controller?.closeCommandMenu();
			void controller?.runCommand(command.id);
		},
		children: props.children ?? command.label,
	};

	return renderAsChild(
		itemProps,
		"button",
		{
			type: "button",
			role: "option",
			"data-pen-ai-command-item": "",
			"data-command-id": command.id,
			"data-command-group": command.group ?? undefined,
		},
	);
}
