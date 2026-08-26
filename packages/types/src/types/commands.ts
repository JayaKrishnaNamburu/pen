import type { Editor } from "./editor";
import type { FacetProvider, Precedence } from "./facets";
import type { ApplyOptions, DocumentOp } from "./ops";
import type { SelectionState } from "./selection";

export interface Command<P = void> {
	readonly name: string;
}

export type CommandResult =
	| boolean
	| { ops: DocumentOp[]; options?: ApplyOptions }
	| { selection: SelectionState };

export type CommandHandler<P> = (
	editor: Editor,
	param: P,
) => CommandResult | false;

export interface CommandHandlerRegistration<P = unknown> {
	readonly command: Command<P>;
	readonly handler: CommandHandler<P>;
}

export type DefineCommand = <P = void>(name: string) => Command<P>;

export interface CommandHandlerProvider extends FacetProvider {
	readonly command: Command<unknown>;
	readonly handler: CommandHandler<unknown>;
	readonly precedence: Precedence;
}
