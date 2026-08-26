import type {
	Command,
	CommandHandler,
	FacetProvider,
	Precedence,
} from "@input/pen-types";

const PEN_COMMANDS_FACET = "pen.commands";

export const BUILTIN_COMMAND_PRECEDENCE: Precedence = "default";

export interface CommandHandlerProviderRecord extends FacetProvider {
	readonly command: Command<unknown>;
	readonly handler: CommandHandler<unknown>;
}

export function defineCommand<P = void>(name: string): Command<P> {
	return { name };
}

export function commandHandler<P>(
	command: Command<P>,
	handler: CommandHandler<P>,
	precedence: Precedence = BUILTIN_COMMAND_PRECEDENCE,
): FacetProvider {
	const provider: CommandHandlerProviderRecord = {
		facetName: PEN_COMMANDS_FACET,
		precedence,
		command: command as Command<unknown>,
		handler: handler as CommandHandler<unknown>,
	};
	return provider;
}

export function isCommandHandlerProvider(
	provider: FacetProvider,
): provider is CommandHandlerProviderRecord {
	return (
		provider.facetName === PEN_COMMANDS_FACET &&
		"command" in provider &&
		"handler" in provider
	);
}
