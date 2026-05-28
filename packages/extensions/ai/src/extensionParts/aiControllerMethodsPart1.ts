// @ts-nocheck
import type {
	AICommandBinding,
	AICommandContext,
	AIControllerState,
	AIStreamEvent,
} from "../types";
import {
	resolveActiveBlockId,
	resolveSelectionText,
} from "./extensionHelpers";
import { sessionControllerMethods } from "./controllers/sessionControllerMethods";

export const aiControllerMethodsPart1 = {
	destroy(this: any): void {
		this._unsubscribeInlineCompletion?.();
		this._unsubscribeInlineCompletion = null;
		this._unsubscribeHistoryApplied?.();
		this._unsubscribeHistoryApplied = null;
		this._unsubscribeUndoHistoryMetadata?.();
		this._unsubscribeUndoHistoryMetadata = null;
	},

	getState(this: any): AIControllerState {
		return this._state;
	},

	subscribe(this: any, listener: () => void): () => void {
		this._listeners.add(listener);
		return () => this._listeners.delete(listener);
	},

	getStreamEvents(this: any): readonly AIStreamEvent[] {
		return this._streamEvents;
	},

	subscribeStreamEvents(this: any, listener: () => void): () => void {
		this._streamEventListeners.add(listener);
		return () => this._streamEventListeners.delete(listener);
	},

	getCommands(this: any): readonly AICommandBinding[] {
		return this._registry.list(this.getCommandContext());
	},

	getCommandContext(this: any): AICommandContext {
		const selection = this._editor.selection;
		const blockId = resolveActiveBlockId(selection);
		return {
			editor: this._editor,
			selection,
			selectedText:
				selection?.type === "text"
					? resolveSelectionText(this._editor, selection)
					: "",
			blockType: blockId
				? (this._editor.getBlock(blockId)?.type ?? null)
				: null,
			blockId,
		};
	},

	...sessionControllerMethods,
};
