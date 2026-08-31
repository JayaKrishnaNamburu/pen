import { useCallback, useEffect, useRef, useState } from "react";
import {
	resolveSuggestionMenuTarget,
	type SuggestionMenuTarget,
	type SuggestionMenuTrigger,
} from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

export type {
	SuggestionMenuBoundary,
	SuggestionMenuTarget,
	SuggestionMenuTrigger,
} from "@input/pen-core";
export { resolveSuggestionMenuTarget } from "@input/pen-core";

export type SuggestionMenuStatus = "idle" | "loading" | "ready" | "error";

export interface SuggestionMenuGetItemsOptions {
	editor: Editor;
	query: string;
	signal: AbortSignal | null;
	target: SuggestionMenuTarget;
}

export interface SuggestionMenuSelectOptions<TItem> {
	editor: Editor;
	index: number;
	item: TItem;
	target: SuggestionMenuTarget;
}

export interface UseSuggestionMenuOptions<TItem> {
	editor: Editor;
	trigger: SuggestionMenuTrigger;
	getItems: (
		options: SuggestionMenuGetItemsOptions,
	) => readonly TItem[] | Promise<readonly TItem[]>;
	onSelect: (options: SuggestionMenuSelectOptions<TItem>) => boolean | void;
	enabled?: boolean;
}

export interface SuggestionMenuState<TItem> {
	open: boolean;
	query: string;
	items: readonly TItem[];
	selectedIndex: number;
	status: SuggestionMenuStatus;
	target: SuggestionMenuTarget | null;
	error: unknown;
}

export interface SuggestionMenuActions {
	select: (index: number) => void;
	confirm: (index?: number) => boolean;
	dismiss: () => void;
	refresh: () => void;
}

export type SuggestionMenuController<TItem> = SuggestionMenuState<TItem> &
	SuggestionMenuActions;

export function useSuggestionMenu<TItem>(
	options: UseSuggestionMenuOptions<TItem>,
): SuggestionMenuController<TItem> {
	const { editor } = options;
	const trigger = options.trigger;
	const triggerQueryPatternKey = trigger.queryPattern
		? `${trigger.queryPattern.source}/${trigger.queryPattern.flags}`
		: undefined;
	const optionsRef = useRef(options);
	optionsRef.current = options;

	const requestRef = useRef<{
		abortController: AbortController | null;
		id: number;
	}>({
		abortController: null,
		id: 0,
	});
	const [state, setState] = useState<SuggestionMenuState<TItem>>({
		open: false,
		query: "",
		items: [],
		selectedIndex: 0,
		status: "idle",
		target: null,
		error: null,
	});
	const stateRef = useRef(state);
	stateRef.current = state;
	const didRunConfigEffectRef = useRef(false);

	const dismiss = useCallback(() => {
		requestRef.current.id += 1;
		requestRef.current.abortController?.abort();
		requestRef.current.abortController = null;
		setState((previous) => {
			if (!previous.open && previous.status === "idle") {
				return previous;
			}
			return {
				open: false,
				query: "",
				items: [],
				selectedIndex: 0,
				status: "idle",
				target: null,
				error: null,
			};
		});
	}, []);

	const refresh = useCallback(() => {
		const currentOptions = optionsRef.current;
		if (currentOptions.enabled === false) {
			dismiss();
			return;
		}

		const target = resolveSuggestionMenuTarget(
			currentOptions.editor,
			currentOptions.trigger,
		);
		if (!target) {
			dismiss();
			return;
		}

		const abortController =
			typeof AbortController === "undefined"
				? null
				: new AbortController();
		const requestId = requestRef.current.id + 1;
		requestRef.current.id = requestId;
		requestRef.current.abortController?.abort();
		requestRef.current.abortController = abortController;

		setState((previous) => ({
			open: true,
			query: target.query,
			items: [],
			selectedIndex: areSuggestionTargetsEqual(previous.target, target)
				? previous.selectedIndex
				: 0,
			status: "loading",
			target,
			error: null,
		}));

		void Promise.resolve(
			currentOptions.getItems({
				editor: currentOptions.editor,
				query: target.query,
				signal: abortController?.signal ?? null,
				target,
			}),
		)
			.then((items) => {
				if (requestRef.current.id !== requestId) {
					return;
				}
				if (abortController?.signal.aborted) {
					return;
				}
				const currentTarget = resolveSuggestionMenuTarget(
					currentOptions.editor,
					currentOptions.trigger,
				);
				if (!areSuggestionTargetsEqual(currentTarget, target)) {
					return;
				}

				setState((previous) => ({
					open: true,
					query: target.query,
					items,
					selectedIndex:
						items.length === 0
							? 0
							: Math.min(
									previous.selectedIndex,
									items.length - 1,
								),
					status: "ready",
					target,
					error: null,
				}));
			})
			.catch((error: unknown) => {
				if (requestRef.current.id !== requestId) {
					return;
				}
				if (isAbortError(error) || abortController?.signal.aborted) {
					return;
				}
				setState({
					open: true,
					query: target.query,
					items: [],
					selectedIndex: 0,
					status: "error",
					target,
					error,
				});
			});
	}, [dismiss]);

	useIsomorphicLayoutEffect(() => {
		optionsRef.current = options;
	});

	useEffect(() => {
		refresh();
		const unsubscribeDocument = editor.on("commit", () => refresh());
		const unsubscribeSelection = editor.onSelectionChange(refresh);
		return () => {
			unsubscribeDocument();
			unsubscribeSelection();
			requestRef.current.id += 1;
			requestRef.current.abortController?.abort();
			requestRef.current.abortController = null;
		};
	}, [editor, refresh]);

	useEffect(() => {
		if (!didRunConfigEffectRef.current) {
			didRunConfigEffectRef.current = true;
			return;
		}
		if (options.enabled === false) {
			dismiss();
			return;
		}
		refresh();
	}, [
		dismiss,
		options.enabled,
		trigger.allowSpaces,
		trigger.boundary,
		trigger.char,
		trigger.closingChar,
		trigger.lookbehind,
		trigger.maxQueryLength,
		trigger.minQueryLength,
		triggerQueryPatternKey,
		refresh,
	]);

	const select = useCallback((index: number) => {
		setState((previous) => {
			if (previous.items.length === 0) {
				return previous;
			}
			return {
				...previous,
				selectedIndex: Math.max(
					0,
					Math.min(index, previous.items.length - 1),
				),
			};
		});
	}, []);

	const confirm = useCallback(
		(index?: number): boolean => {
			const currentState = stateRef.current;
			const itemIndex = index ?? currentState.selectedIndex;
			const item = currentState.items[itemIndex];
			if (!item || !currentState.target) {
				return false;
			}

			const currentOptions = optionsRef.current;
			const currentTarget = resolveSuggestionMenuTarget(
				currentOptions.editor,
				currentOptions.trigger,
			);
			if (
				!areSuggestionTargetsEqual(currentTarget, currentState.target)
			) {
				dismiss();
				return false;
			}

			const result = currentOptions.onSelect({
				editor: currentOptions.editor,
				index: itemIndex,
				item,
				target: currentState.target,
			});
			if (result !== false) {
				dismiss();
				return true;
			}
			return false;
		},
		[dismiss],
	);

	return {
		...state,
		select,
		confirm,
		dismiss,
		refresh,
	};
}

function areSuggestionTargetsEqual(
	left: SuggestionMenuTarget | null,
	right: SuggestionMenuTarget | null,
): boolean {
	return (
		left?.blockId === right?.blockId &&
		left?.startOffset === right?.startOffset &&
		left?.endOffset === right?.endOffset &&
		left?.query === right?.query &&
		left?.trigger === right?.trigger
	);
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}
