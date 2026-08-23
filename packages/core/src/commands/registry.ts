import type {
	ApplyOptions,
	Command,
	CommandHandler,
	CommandResult,
	DiagnosticEvent,
	DocumentOp,
	DocumentState,
	Editor,
	FacetProvider,
	OpOrigin,
	Precedence,
	SelectionState,
	StructuredOpOrigin,
} from "@input/pen-types";

import { isCommandHandlerProvider } from "./define";

export interface CommandDispatchContext {
	origin?: OpOrigin;
	fromKeymap?: boolean;
}

export interface RecordedApplyIntent {
	ops: DocumentOp[];
	options?: ApplyOptions;
}

export interface RecordedSelectionIntent {
	selection: SelectionState;
	origin: "keyboard" | "programmatic";
}

export interface CreateCommandRegistryOptions {
	providers?: readonly FacetProvider[];
	editor?: Editor;
	apply?: (ops: DocumentOp[], options?: ApplyOptions) => void;
	setSelection?: (
		selection: SelectionState,
		origin: "keyboard" | "programmatic",
	) => void;
}

export interface CommandRegistry {
	dispatch<P>(
		command: Command<P>,
		param: P,
		context?: CommandDispatchContext,
	): boolean;
	canDispatch<P>(command: Command<P>, param: P): boolean;
	probe(): Editor;
	readonly recordedApplies: readonly RecordedApplyIntent[];
	readonly recordedSelections: readonly RecordedSelectionIntent[];
	readonly diagnostics: readonly DiagnosticEvent[];
}

const PRECEDENCE_RANK: Record<Precedence, number> = {
	highest: 0,
	high: 1,
	default: 2,
	low: 3,
	lowest: 4,
};

const SELECTION_WRITE_KEYS = new Set<PropertyKey>([
	"selectBlock",
	"selectBlocks",
	"selectCell",
	"selectCellRange",
	"selectText",
	"selectTextRange",
	"selectAll",
	"replaceSelection",
	"deleteSelection",
]);

type SelectionWriteOrigin = "keyboard" | "programmatic";

type InterpretedResult =
	| { kind: "miss" }
	| { kind: "handled" }
	| { kind: "ops"; ops: DocumentOp[]; options?: ApplyOptions }
	| { kind: "selection"; selection: SelectionState };

interface QueuedDispatch {
	command: Command<unknown>;
	param: unknown;
	context?: CommandDispatchContext;
}

interface ResolvedHandler {
	commandName: string;
	handler: CommandHandler<unknown>;
	precedence: Precedence;
	index: number;
}

export function createCommandRegistry(
	options: CreateCommandRegistryOptions = {},
): CommandRegistry {
	const sourceEditor = options.editor ?? createMinimalEditor();
	const handlers = resolveHandlers(options.providers ?? []);
	const recordedApplies: RecordedApplyIntent[] = [];
	const recordedSelections: RecordedSelectionIntent[] = [];
	const diagnostics: DiagnosticEvent[] = [];
	const queue: QueuedDispatch[] = [];
	let dispatching = false;

	function emitDiagnostic(event: DiagnosticEvent): void {
		diagnostics.push(event);
		sourceEditor.internals?.emit("diagnostic", event);
	}

	function commitApply(
		ops: DocumentOp[],
		applyOptions: ApplyOptions | undefined,
	): void {
		recordedApplies.push({ ops, options: applyOptions });
		options.apply?.(ops, applyOptions);
	}

	function commitSelection(
		selection: SelectionState,
		origin: SelectionWriteOrigin,
	): void {
		recordedSelections.push({ selection, origin });
		options.setSelection?.(selection, origin);
	}

	function runDispatch(
		command: Command<unknown>,
		param: unknown,
		context: CommandDispatchContext | undefined,
	): boolean {
		const matches = handlers.filter(
			(entry) => entry.commandName === command.name,
		);
		for (const entry of matches) {
			let appliedDuringHandler = false;
			const dispatchEditor = wrapEditor(sourceEditor, {
				onApply(ops, applyOptions) {
					appliedDuringHandler = true;
					commitApply(
						ops,
						stampDispatchOrigin(
							entry.commandName,
							applyOptions,
							context?.origin,
							emitDiagnostic,
						),
					);
				},
				onSetSelection(selection) {
					commitSelection(
						selection,
						context?.fromKeymap ? "keyboard" : "programmatic",
					);
				},
			});
			const interpreted = interpretCommandResult(
				entry.handler(dispatchEditor, param),
			);
			switch (interpreted.kind) {
				case "miss":
					continue;
				case "handled":
					return true;
				case "ops": {
					if (appliedDuringHandler) {
						emitDiagnostic({
							code: "command-double-effect",
							level: "warn",
							source: "commands",
							message:
								"handler applied during dispatch and returned ops",
							command: command.name,
						});
						return true;
					}
					commitApply(
						interpreted.ops,
						stampDispatchOrigin(
							command.name,
							{
								origin: context?.origin ?? "user",
								...interpreted.options,
							},
							context?.origin,
							emitDiagnostic,
						),
					);
					return true;
				}
				case "selection":
					commitSelection(
						interpreted.selection,
						context?.fromKeymap ? "keyboard" : "programmatic",
					);
					return true;
				default: {
					const _exhaustive: never = interpreted;
					return _exhaustive;
				}
			}
		}
		return false;
	}

	function dispatch<P>(
		command: Command<P>,
		param: P,
		context?: CommandDispatchContext,
	): boolean {
		if (dispatching) {
			queue.push({
				command: command as Command<unknown>,
				param,
				context,
			});
			return true;
		}

		dispatching = true;
		try {
			const handled = runDispatch(
				command as Command<unknown>,
				param,
				context,
			);
			while (queue.length > 0) {
				const queued = queue.shift();
				if (!queued) {
					break;
				}
				runDispatch(queued.command, queued.param, queued.context);
			}
			return handled;
		} finally {
			dispatching = false;
		}
	}

	function canDispatch<P>(command: Command<P>, param: P): boolean {
		const probeEditor = createProbeEditor(sourceEditor);
		const matches = handlers.filter(
			(entry) => entry.commandName === command.name,
		);
		for (const entry of matches) {
			if (interpretCommandResult(entry.handler(probeEditor, param)).kind !== "miss") {
				return true;
			}
		}
		return false;
	}

	return {
		dispatch,
		canDispatch,
		probe: () => createProbeEditor(sourceEditor),
		recordedApplies,
		recordedSelections,
		diagnostics,
	};
}

function resolveHandlers(
	providers: readonly FacetProvider[],
): ResolvedHandler[] {
	const resolved: ResolvedHandler[] = [];
	for (const [index, provider] of providers.entries()) {
		if (!isCommandHandlerProvider(provider)) {
			continue;
		}
		resolved.push({
			commandName: provider.command.name,
			handler: provider.handler,
			precedence: provider.precedence,
			index,
		});
	}
	resolved.sort((left, right) => {
		const rankDelta =
			PRECEDENCE_RANK[left.precedence] - PRECEDENCE_RANK[right.precedence];
		if (rankDelta !== 0) {
			return rankDelta;
		}
		return left.index - right.index;
	});
	return resolved;
}

function asStructuredOrigin(origin: OpOrigin): StructuredOpOrigin {
	return typeof origin === "string" ? { type: origin } : { ...origin };
}

function stampDispatchOrigin(
	commandName: string,
	applyOptions: ApplyOptions | undefined,
	contextOrigin: OpOrigin | undefined,
	emitDiagnostic: (event: DiagnosticEvent) => void,
): ApplyOptions {
	const incoming = applyOptions?.origin ?? contextOrigin ?? "user";
	const structured = asStructuredOrigin(incoming);
	const overwriteAttempted =
		structured.intent !== undefined && structured.intent !== commandName;
	if (overwriteAttempted) {
		emitDiagnostic({
			code: "command-intent-overwrite",
			level: "warn",
			source: "commands",
			message: "handler or host origin.intent was ignored; dispatch stamps the command name",
			command: commandName,
			attempted: structured.intent,
		});
	}
	return {
		...applyOptions,
		origin: {
			...structured,
			intent: commandName,
		},
	};
}

function interpretCommandResult(result: CommandResult | false): InterpretedResult {
	if (result === false) {
		return { kind: "miss" };
	}
	if (result === true) {
		return { kind: "handled" };
	}
	if ("ops" in result) {
		return { kind: "ops", ops: result.ops, options: result.options };
	}
	if ("selection" in result) {
		return { kind: "selection", selection: result.selection };
	}
	const _exhaustive: never = result;
	return _exhaustive;
}

function createProbeEditor(source: Editor): Editor {
	return wrapEditor(source, {
		onApply() {},
		onSetSelection() {},
	});
}

function wrapEditor(
	source: Editor,
	hooks: {
		onApply: (ops: DocumentOp[], options?: ApplyOptions) => void;
		onSetSelection: (selection: SelectionState) => void;
	},
): Editor {
	return new Proxy(source, {
		get(target, prop, receiver) {
			if (prop === "apply") {
				return (ops: DocumentOp[], applyOptions?: ApplyOptions) => {
					hooks.onApply(ops, applyOptions);
				};
			}
			if (prop === "setSelection") {
				return (selection: SelectionState) => {
					hooks.onSetSelection(selection);
				};
			}
			if (SELECTION_WRITE_KEYS.has(prop)) {
				return () => {};
			}
			const value = Reflect.get(target, prop, receiver);
			if (typeof value === "function") {
				return value.bind(target);
			}
			return value;
		},
	});
}

function createMinimalEditor(): Editor {
	const selection: SelectionState = { type: "block", blockIds: [] };
	const documentState = { generation: 0 } as DocumentState;
	return {
		apply() {},
		setSelection() {},
		getSelection() {
			return selection;
		},
		selection,
		documentState,
	} as unknown as Editor;
}
