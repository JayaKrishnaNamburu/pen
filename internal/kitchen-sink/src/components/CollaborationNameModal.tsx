import { useEffect, useRef, useState, type FormEvent } from "react";
import "./CollaborationNameModal.css";

type CollaborationNameModalProps = {
	defaultName: string;
	room: string;
	onSubmit: (name: string) => void;
};

export function CollaborationNameModal({
	defaultName,
	room,
	onSubmit,
}: CollaborationNameModalProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [name, setName] = useState(defaultName);

	const isSubmitDisabled = name.trim().length === 0;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmedName = name.trim();
		if (!trimmedName) {
			return;
		}

		onSubmit(trimmedName);
	};

	useEffect(() => {
		requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
	}, []);

	return (
		<div className="playground-collaboration-modal-backdrop">
			<form className="playground-collaboration-modal" onSubmit={handleSubmit}>
				<div className="playground-collaboration-modal-copy">
					<span className="playground-collaboration-modal-eyebrow">
						Live collaboration
					</span>
					<h1 className="playground-collaboration-modal-title">
						Enter your name to join
					</h1>
					<p className="playground-collaboration-modal-description">
						Your name will be shown to other collaborators in the playground
						room.
					</p>
					<p className="playground-collaboration-modal-room">
						{`Room: ${room}`}
					</p>
				</div>
				<label className="playground-collaboration-modal-field">
					<span className="playground-collaboration-modal-label">Display name</span>
					<input
						ref={inputRef}
						className="playground-collaboration-modal-input"
						type="text"
						maxLength={40}
						value={name}
						onChange={(event) => {
							setName(event.target.value);
						}}
						placeholder="Ada Lovelace"
					/>
				</label>
				<button
					className="playground-collaboration-modal-submit"
					type="submit"
					disabled={isSubmitDisabled}
				>
					Join playground
				</button>
			</form>
		</div>
	);
}
