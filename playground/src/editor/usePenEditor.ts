import { useEffect, useState } from "react";
import { getAIController } from "@input/pen-ai";
import { getSmoothStreamController } from "@input/pen-ai/stream";
import {
	getMultiplayerController,
	type MultiplayerController,
} from "@input/pen-multiplayer";
import type { Editor, Unsubscribe } from "@input/pen-types";
import {
	createCollaborationExtension,
	type CollaborationSession,
} from "../collaboration/session";
import { createPenEditor } from "./penEditor";
import { subscribePrefersReducedMotion } from "./prefersReducedMotion";
import { applyStarterDocument } from "./starterDocument";

/**
 * Owns the one editor instance for the app.
 *
 * Returns `null` on the first render because the editor is created in an
 * effect, which keeps creation and teardown paired. Recreates when a
 * collaboration session starts or stops, because the multiplayer extension
 * has to be present at `createEditor`.
 */
export function usePenEditor(
	session: CollaborationSession | null,
): Editor | null {
	const [editor, setEditor] = useState<Editor | null>(null);
	const sessionKey = session
		? `${session.room}:${session.user.id}:${session.user.name}`
		: "local";

	useEffect(() => {
		const nextEditor = createPenEditor(
			session ? [createCollaborationExtension(session)] : [],
		);
		let stopWaitingForRoom: Unsubscribe | null = null;
		if (session) {
			stopWaitingForRoom = seedRoomOnceSynced(nextEditor);
		} else {
			applyStarterDocument(nextEditor);
		}

		setEditor(nextEditor);
		// Console handles for debugging. The AI controller is here for the
		// same reason the editor is: when a turn misbehaves, the route it
		// took and the preview it is holding are the first two things to read.
		window.penPlayground = {
			editor: nextEditor,
			aiController: getAIController(nextEditor),
			smoothStream: getSmoothStreamController(nextEditor),
		};

		const stopReducedMotion = subscribePrefersReducedMotion((reduced) => {
			getSmoothStreamController(nextEditor)?.setEnabled(!reduced);
		});

		return () => {
			stopReducedMotion();
			stopWaitingForRoom?.();
			if (window.penPlayground?.editor === nextEditor) {
				delete window.penPlayground;
			}
			void nextEditor.destroy();
			setEditor(null);
		};
	}, [session, sessionKey]);

	return editor;
}

/**
 * Settles a brand-new editor into a room once the room has arrived.
 *
 * Every editor starts with one empty paragraph, and the CRDT counts that as a
 * real insert — so joining without doing anything would merge a stray blank
 * block into everyone's document. Once synced, either seed a room nobody has
 * written in yet or drop the block this client brought with it.
 */
function seedRoomOnceSynced(editor: Editor): Unsubscribe {
	const arrivedWithBlockId = editor.firstBlock()?.id ?? null;
	let isSettled = false;
	let stopSubscribe: Unsubscribe | null = null;
	let isCancelled = false;

	const settleWith = (controller: MultiplayerController): boolean => {
		if (controller.getState().connectionState !== "connected") {
			return false;
		}

		const arrivedWith = arrivedWithBlockId
			? editor.getBlock(arrivedWithBlockId)
			: null;
		if (
			arrivedWith &&
			editor.blockCount() > 1 &&
			arrivedWith.textContent() === ""
		) {
			editor.apply([{ type: "delete-block", blockId: arrivedWith.id }], {
				origin: "system",
			});
		}

		applyStarterDocument(editor);
		return true;
	};

	const watch = (controller: MultiplayerController): void => {
		if (settleWith(controller)) {
			return;
		}
		stopSubscribe = controller.subscribe(() => {
			if (isSettled) {
				return;
			}
			isSettled = settleWith(controller);
		});
	};

	const controller = getMultiplayerController(editor);
	if (controller) {
		watch(controller);
	} else {
		void editor.whenReady().then(() => {
			if (isCancelled) {
				return;
			}
			const ready = getMultiplayerController(editor);
			if (ready) {
				watch(ready);
			}
		});
	}

	return () => {
		isCancelled = true;
		stopSubscribe?.();
	};
}
