import type {
	AICommandExecutionOptions,
	AIContextualPromptRect,
	AISession,
	AISessionResolution,
	AISurface,
	GenerationState,
} from "../../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import {
	createDefaultSessionFastApplyMetrics,
	resolveBlockIdForRequestedOperation,
	resolveContextualPromptAnchor,
	resolveContextualPromptState,
	resolvePreviousGeneratedBlockIds,
	resolveRequestedOperationForSession,
	resolveSelectionForRequestedOperation,
	resolveSessionAnchor,
	resolveSessionTarget,
	sessionTargetMatches,
	shouldReplacePreviousGeneratedBlocks,
} from "../extensionHelpers";

export const sessionControllerMethods = {
	getSessions(this: AIControllerMethodHost): readonly AISession[] {
		return this._state.sessions;
	},

	getActiveSession(this: AIControllerMethodHost): AISession | null {
		const activeSessionId = this._state.activeSessionId;
		if (!activeSessionId) {
			return null;
		}
		return (
			this._state.sessions.find(
				(session) => session.id === activeSessionId,
			) ?? null
		);
	},

	subscribeSessions(this: AIControllerMethodHost, listener: () => void): () => void {
		this._sessionListeners.add(listener);
		return () => this._sessionListeners.delete(listener);
	},

	startSession(
		this: AIControllerMethodHost,
		input: {
			surface: AISurface;
			target?: "auto" | "selection" | "block" | "document";
		},
	): AISession {
		const now = Date.now();
		const target = resolveSessionTarget(this._editor, input.target);
		const session: AISession = {
			id: crypto.randomUUID(),
			surface: input.surface,
			status: "idle",
			target,
			contextualPrompt:
				input.surface === "inline-edit"
					? resolveContextualPromptState(target)
					: undefined,
			turns: [],
			activeTurnId: undefined,
			promptHistory: [],
			generationIds: [],
			pendingSuggestionIds: [],
			pendingReviewItemIds: [],
			createdAt: now,
			updatedAt: now,
			metrics: {
				streamEventCount: 0,
				patchCount: 0,
				fastApply: createDefaultSessionFastApplyMetrics(),
			},
			anchor: resolveSessionAnchor(this._editor.selection),
		};
		this._setState({
			sessions: [...this._state.sessions, session],
			activeSessionId: session.id,
		});
		return session;
	},

	openContextualPrompt(
		this: AIControllerMethodHost,
		input?: {
			surface?: Extract<AISurface, "inline-edit">;
			target?: "auto" | "selection" | "block" | "document";
		},
	): AISession | null {
		const surface = input?.surface ?? "inline-edit";
		const target = resolveSessionTarget(
			this._editor,
			input?.target ?? "selection",
		);
		if (surface === "inline-edit" && target.kind === "document") {
			return null;
		}
		const activeSession = this._state.sessions.find(
			(session) =>
				session.id === this._state.activeSessionId &&
				session.surface === surface &&
				session.status !== "cancelled",
		);
		if (
			activeSession &&
			activeSession.status !== "complete" &&
			sessionTargetMatches(activeSession, target)
		) {
			this._updateSession(activeSession.id, {
				target,
				anchor: resolveSessionAnchor(this._editor.selection),
				contextualPrompt: {
					...(activeSession.contextualPrompt ??
						resolveContextualPromptState(target)),
					anchor: resolveContextualPromptAnchor(target),
					composer: {
						...(activeSession.contextualPrompt?.composer ?? {
							draftPrompt: "",
							isSubmitting: false,
							canSubmitFollowUp: true,
							openReason: "user",
						}),
						isOpen: true,
						openReason: "user",
					},
				},
			});
			return this.getActiveSession();
		}
		if (activeSession?.surface === "inline-edit") {
			this._setInlineSessionComposerOpen(activeSession.id, false);
		}
		const nextSession = this.startSession({
			surface,
			target: input?.target ?? "selection",
		});
		const anchorKind = nextSession.contextualPrompt?.anchor.kind;
		return anchorKind === "text-range" || anchorKind === "block"
			? nextSession
			: null;
	},

	updateContextualPromptDraft(
		this: AIControllerMethodHost,
		sessionId: string,
		draftPrompt: string,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session?.contextualPrompt) {
			return;
		}
		this._updateSession(sessionId, {
			contextualPrompt: {
				...session.contextualPrompt,
				composer: {
					...session.contextualPrompt.composer,
					draftPrompt,
				},
			},
		});
	},

	setContextualPromptAnchorRect(
		this: AIControllerMethodHost,
		sessionId: string,
		rect: AIContextualPromptRect | null,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session?.contextualPrompt) {
			return;
		}
		this._updateSession(sessionId, {
			contextualPrompt: {
				...session.contextualPrompt,
				anchor: {
					...session.contextualPrompt.anchor,
					lastResolvedRect: rect,
				},
			},
		});
	},

	resolveSessionTurn(
		this: AIControllerMethodHost,
		sessionId: string,
		turnId: string,
		resolution: AISessionResolution,
	): boolean {
		return this._resolveSessionTurn(sessionId, turnId, resolution);
	},

	acceptSessionTurn(this: AIControllerMethodHost, sessionId: string, turnId: string): boolean {
		return this.resolveSessionTurn(sessionId, turnId, "accept");
	},

	rejectSessionTurn(this: AIControllerMethodHost, sessionId: string, turnId: string): boolean {
		return this.resolveSessionTurn(sessionId, turnId, "reject");
	},

	runSessionPrompt(
		this: AIControllerMethodHost,
		sessionId: string,
		prompt: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState> {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session) {
			return Promise.reject(
				new Error(`Unknown AI session "${sessionId}"`),
			);
		}
		this._recordInlinePromptSubmissionCheckpoint(sessionId, prompt);

		const operation =
			options?.operation ??
			resolveRequestedOperationForSession(
				this._editor,
				session,
				prompt,
				options,
				this._documentVersion,
			);
		if (operation.kind === "rewrite-selection") {
			const selection = resolveSelectionForRequestedOperation(
				this._editor,
				operation,
			);
			if (!selection) {
				return Promise.reject(
					new Error(
						"Cannot run a session prompt without a valid text selection",
					),
				);
			}
			return this._runSelectionGeneration(
				prompt,
				selection,
				undefined,
				options?.maxSteps,
				{
					sessionId,
					surface: session.surface,
					operation,
				},
			);
		}
		if (operation.kind === "document-transform") {
			const targetBlockIds =
				operation.target.kind === "document" &&
				(operation.target.blockIds?.length ?? 0) > 0
					? [...(operation.target.blockIds ?? [])]
					: undefined;
			const replacePreviousGeneratedBlocks =
				shouldReplacePreviousGeneratedBlocks(session, prompt);
			return this._runDocumentGeneration(
				prompt,
				options?.blockId ??
					(operation.target.kind === "document"
						? operation.target.activeBlockId
						: null),
				undefined,
				options?.maxSteps,
				{
					sessionId,
					surface: session.surface,
					operation,
					replaceBlockIds:
						targetBlockIds ??
						(replacePreviousGeneratedBlocks
							? resolvePreviousGeneratedBlockIds(session)
							: undefined),
				},
			);
		}
		const blockId =
			options?.blockId ??
			resolveBlockIdForRequestedOperation(operation) ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!blockId) {
			return Promise.reject(
				new Error(
					"Cannot run an AI session prompt without a target block",
				),
			);
		}
		return this._runBlockGeneration(
			prompt,
			blockId,
			undefined,
			options?.maxSteps,
			{
				sessionId,
				surface: session.surface,
				operation,
			},
		);
	},
};
