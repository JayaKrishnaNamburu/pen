import { useState } from "react";
import { getAIController } from "@input/pen-ai";
import { useAI } from "@input/pen-react";
import type { Editor } from "@input/pen-types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Toggle } from "../ui/Toggle";
import { ApiKeyModal } from "./ApiKeyModal";

/**
 * The controls on the agent bar: review vs apply directly, a new chat, and
 * the Anthropic key. They used to share a more menu; each now has its own
 * control.
 */
export function ChatBarActions({
	editor,
	onNewChat,
}: {
	editor: Editor;
	onNewChat: () => void;
}) {
	const [isKeyOpen, setIsKeyOpen] = useState(false);

	const openKey = () => {
		setIsKeyOpen(true);
	};

	const closeKey = () => {
		setIsKeyOpen(false);
	};

	return (
		<div className="chat-bar-actions">
			<ReviewToggle editor={editor} />
			<Button.Tooltip content="New Chat">
				<Button.Icon label="New Chat" onClick={onNewChat}>
					<Icon.Plus />
				</Button.Icon>
			</Button.Tooltip>
			<Button.Tooltip content="Anthropic API Key">
				<Button.Icon label="Anthropic API Key" onClick={openKey}>
					<Icon.Anthropic />
				</Button.Icon>
			</Button.Tooltip>
			<ApiKeyModal open={isKeyOpen} onClose={closeKey} />
		</div>
	);
}

function ReviewToggle({ editor }: { editor: Editor }) {
	const aiState = useAI(editor);
	const isReview = aiState.mutationPreference !== "direct";

	const handleChange = (active: boolean) => {
		getAIController(editor)?.setMutationPreference(
			active ? "suggestions" : "direct",
		);
	};

	return <Toggle active={isReview} label="Review" onChange={handleChange} />;
}
