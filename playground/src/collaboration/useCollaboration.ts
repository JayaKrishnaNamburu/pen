import { useCallback, useState } from "react";
import {
	readRoomFromUrl,
	readSession,
	readStoredUser,
	saveUserName,
	writeRoomToUrl,
	type CollaborationSession,
} from "./session";

export function useCollaboration() {
	const [session, setSession] = useState<CollaborationSession | null>(() =>
		readSession(),
	);
	// A shared `?room=` link is an invitation, not a join. Without a stored
	// name there is no session, so open the card and let them pick one.
	const [isModalOpen, setIsModalOpen] = useState(
		() => readRoomFromUrl() !== null && readSession() === null,
	);

	const storedUser = readStoredUser();
	const defaultName = session?.user.name ?? storedUser.name;
	const defaultRoom = session?.room ?? readRoomFromUrl() ?? "";

	const openModal = useCallback(() => setIsModalOpen(true), []);
	const closeModal = useCallback(() => setIsModalOpen(false), []);

	const join = useCallback((next: { name: string; room: string }) => {
		const user = saveUserName(next.name);
		writeRoomToUrl(next.room);
		setSession({ room: next.room, user });
		setIsModalOpen(false);
	}, []);

	const leave = useCallback(() => {
		writeRoomToUrl(null);
		setSession(null);
		setIsModalOpen(false);
	}, []);

	return {
		session,
		isModalOpen,
		defaultName,
		defaultRoom,
		openModal,
		closeModal,
		join,
		leave,
	};
}
